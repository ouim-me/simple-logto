import { createHash, randomUUID } from 'node:crypto'
import { CompactEncrypt, compactDecrypt } from 'jose'

export interface AuthSessionPayload {
  accessToken: string
  sessionId: string
  issuedAt: number
  expiresAt: number
}

const keyFor = (secret: string) => {
  if (secret.length < 32) throw new Error('The auth session secret must contain at least 32 characters.')
  return createHash('sha256').update(secret).digest()
}

export async function sealAuthSession(accessToken: string, secret: string, ttlSeconds = 8 * 60 * 60): Promise<string> {
  if (!accessToken) throw new Error('An access token is required to create an auth session.')
  const now = Math.floor(Date.now() / 1000)
  const payload: AuthSessionPayload = {
    accessToken,
    sessionId: randomUUID(),
    issuedAt: now,
    expiresAt: now + ttlSeconds,
  }
  return new CompactEncrypt(new TextEncoder().encode(JSON.stringify(payload)))
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM', typ: 'authkit-session+jwe' })
    .encrypt(keyFor(secret))
}

export async function openAuthSession(value: string, secret: string, now = Math.floor(Date.now() / 1000)): Promise<AuthSessionPayload> {
  const { plaintext, protectedHeader } = await compactDecrypt(value, keyFor(secret))
  if (protectedHeader.typ !== 'authkit-session+jwe') throw new Error('The auth session has an invalid type.')
  const session = JSON.parse(new TextDecoder().decode(plaintext)) as Partial<AuthSessionPayload>
  if (!session.accessToken || !session.sessionId || !session.expiresAt || session.expiresAt <= now) {
    throw new Error('The auth session has expired.')
  }
  return session as AuthSessionPayload
}

export async function openAuthSessionWithFallback(value: string, secrets: string[], now?: number): Promise<AuthSessionPayload> {
  let lastError: unknown
  for (const secret of secrets.filter(Boolean)) {
    try {
      return await openAuthSession(value, secret, now)
    } catch (error) {
      lastError = error
    }
  }
  throw lastError ?? new Error('No auth session encryption key is configured.')
}

interface SessionRequestLike {
  headers: Record<string, string | string[] | undefined>
  cookies?: Record<string, string>
}

interface SessionResponseLike {
  status(code: number): SessionResponseLike
  json(body: unknown): SessionResponseLike
}

export interface AuthSessionMiddlewareOptions {
  secrets: string[]
  cookieName?: string
  authorizationHeader?: string
}

/** Hydrates an encrypted HttpOnly application session into a bearer token for downstream verification. */
export function createAuthSessionMiddleware(options: AuthSessionMiddlewareOptions) {
  const cookieName = options.cookieName ?? 'logto_authsession'
  const authorizationHeader = (options.authorizationHeader ?? 'authorization').toLowerCase()
  return (request: SessionRequestLike, response: SessionResponseLike, next: (error?: unknown) => void) => {
    if (request.headers[authorizationHeader]) return next()
    const cookieHeader = request.headers.cookie
    const rawCookie = Array.isArray(cookieHeader) ? cookieHeader[0] : cookieHeader
    const value =
      request.cookies?.[cookieName] ??
      rawCookie
        ?.split(';')
        .map((item) => item.trim())
        .find((item) => item.startsWith(`${encodeURIComponent(cookieName)}=`))
        ?.slice(encodeURIComponent(cookieName).length + 1)
    if (!value) return next()
    void openAuthSessionWithFallback(decodeURIComponent(value), options.secrets)
      .then((session) => {
        request.headers[authorizationHeader] = `Bearer ${session.accessToken}`
        next()
      })
      .catch(() => response.status(401).json({ error: 'session_expired', message: 'Sign in again to continue.' }))
  }
}
