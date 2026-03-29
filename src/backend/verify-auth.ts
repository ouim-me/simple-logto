import { importJWK, jwtVerify } from 'jose'
import type { AuthContext, AuthPayload, VerifyAuthOptions, ExpressRequest, ExpressResponse, ExpressNext, NextRequest } from './types.js'
/**
 * Express middleware for Logto authentication
 */
import cookieParser from 'cookie-parser'

type JsonRecord = Record<string, unknown>
type JwkKey = JsonRecord & {
  kid?: string
  alg?: string
  kty?: string
  use?: string
}
type NextCookieStore = {
  get: (name: string) => { value?: string } | undefined
}
type ExpressCookieStore = Record<string, string>
type HeaderMap = {
  get?: (name: string) => string | null
  authorization?: string | string[]
}

function isNextCookieStore(cookies: unknown): cookies is NextCookieStore {
  return typeof cookies === 'object' && cookies !== null && 'get' in cookies && typeof cookies.get === 'function'
}

function isExpressCookieStore(cookies: unknown): cookies is ExpressCookieStore {
  return typeof cookies === 'object' && cookies !== null
}

function isHeaderMap(headers: unknown): headers is HeaderMap {
  return typeof headers === 'object' && headers !== null
}

// Cache for JWKs to avoid fetching on every request
const jwksCache = new Map<string, { keys: JwkKey[]; expires: number }>()
const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes

/**
 * Normalize a Logto base URL to its OIDC base path.
 *
 * Used by both JWKS URL construction and issuer verification so both always
 * produce the same string from the same input, preventing cache-key mismatches
 * if the normalization logic were ever changed in one place but not the other.
 *
 * @example
 * buildOidcBaseUrl('https://tenant.logto.app/')  // → 'https://tenant.logto.app/oidc'
 * buildOidcBaseUrl('https://host/tenant')         // → 'https://host/tenant/oidc'
 */
function buildOidcBaseUrl(logtoUrl: string): string {
  return `${logtoUrl.replace(/\/+$/, '')}/oidc`
}

/**
 * Extract guest token from cookie
 */
function extractGuestTokenFromCookies(cookies: unknown, cookieName: string = 'guest_logto_authtoken'): string | undefined {
  if (isNextCookieStore(cookies)) {
    // Next.js cookies
    const cookie = cookies.get(cookieName)
    return cookie?.value ?? undefined
  } else if (isExpressCookieStore(cookies)) {
    // Express cookies
    return cookies[cookieName] ?? undefined
  }
  // No recognisable cookie store — guest identity is unknown
  return undefined
}

/**
 * Extract token from cookie
 */
function extractTokenFromCookies(cookies: unknown, cookieName: string = 'logto_authtoken'): string | null {
  if (isNextCookieStore(cookies)) {
    // Next.js cookies
    const cookie = cookies.get(cookieName)
    return cookie?.value || null
  } else if (isExpressCookieStore(cookies)) {
    // Express cookies
    return cookies[cookieName] || null
  }
  return null
}

/**
 * Extract token from Authorization header (Bearer token)
 */
function extractBearerTokenFromHeaders(headers: unknown): string | null {
  if (!isHeaderMap(headers)) {
    return null
  }

  const authorization = typeof headers.get === 'function' ? headers.get('authorization') : headers.authorization

  if (typeof authorization === 'string' && authorization.startsWith('Bearer ')) {
    return authorization.slice(7)
  }
  return null
}

/**
 * Base64URL decode helper
 */
function base64UrlDecode(str: string): string {
  // Convert base64url to base64
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/')

  // Pad with = if needed
  const pad = base64.length % 4
  if (pad) {
    base64 += '='.repeat(4 - pad)
  }

  // Decode from base64
  if (typeof atob !== 'undefined') {
    // Browser environment
    return atob(base64)
  } else {
    // Node.js environment
    return Buffer.from(base64, 'base64').toString()
  }
}

/**
 * Fetch JWKS from Logto server with caching
 */
async function fetchJWKS(logtoUrl: string): Promise<JwkKey[]> {
  const jwksUrl = `${buildOidcBaseUrl(logtoUrl)}/jwks`
  const now = Date.now()

  // Check cache first
  const cached = jwksCache.get(jwksUrl)
  if (cached && cached.expires > now) {
    return cached.keys
  }

  try {
    const response = await fetch(jwksUrl)
    if (!response.ok) {
      throw new Error(`Failed to fetch JWKS: ${response.status} ${response.statusText}`)
    }

    const jwks = await response.json()
    const keys = jwks.keys || []

    // Cache the keys
    jwksCache.set(jwksUrl, {
      keys,
      expires: now + CACHE_DURATION,
    })

    return keys
  } catch (error) {
    throw new Error(`Failed to fetch JWKS from ${jwksUrl}: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Find the appropriate key from JWKS for token verification
 */
function findMatchingKey(keys: JwkKey[], kid?: string, alg?: string): JwkKey {
  if (!keys || keys.length === 0) {
    throw new Error('No keys found in JWKS')
  }

  // If kid is provided, find exact match
  if (kid) {
    const key = keys.find(k => k.kid === kid)
    if (key) return key
    throw new Error(`Key with kid "${kid}" not found in JWKS`)
  }

  // If alg is provided, find by algorithm
  if (alg) {
    const key = keys.find(k => k.alg === alg)
    if (key) return key
  }

  // Default to first key with RSA algorithm
  const rsaKey = keys.find(k => k.kty === 'RSA' && (k.use === 'sig' || !k.use))
  if (rsaKey) return rsaKey

  // Fallback to first key
  return keys[0]
}

/**
 * Manually verify JWT token claims
 */
function verifyTokenClaims(payload: AuthPayload, options: VerifyAuthOptions): void {
  const { logtoUrl, audience, requiredScope } = options
  const exp = typeof payload.exp === 'number' ? payload.exp : undefined
  const nbf = typeof payload.nbf === 'number' ? payload.nbf : undefined

  // Use the shared URL builder so the expected issuer string is always derived
  // the same way as the JWKS URL (avoids silent drift if normalization changes).
  const expectedIssuer = buildOidcBaseUrl(logtoUrl)

  // Verify issuer
  if (payload.iss !== expectedIssuer) {
    throw new Error(`Invalid issuer. Expected: ${expectedIssuer}, Got: ${payload.iss}`)
  }

  // Verify audience — RFC 7519 allows aud to be a string or a string array
  if (audience) {
    const aud = payload.aud
    const expectedAudiences = Array.isArray(audience) ? audience : [audience]
    const tokenAudiences = Array.isArray(aud) ? aud : aud !== undefined ? [aud] : []
    const isValid = tokenAudiences.some(tokenAudience => expectedAudiences.includes(tokenAudience))
    if (!isValid) {
      throw new Error(
        `Invalid audience. Expected one of: ${JSON.stringify(expectedAudiences)}, Got: ${Array.isArray(aud) ? JSON.stringify(aud) : aud}`,
      )
    }
  }

  const now = Math.floor(Date.now() / 1000)

  // Use `!== undefined` (not a truthy check) so that exp/nbf === 0 is correctly
  // treated as an expired / not-yet-valid token rather than being silently skipped.
  if (exp !== undefined && exp < now) {
    throw new Error('Token has expired')
  }

  if (nbf !== undefined && nbf > now) {
    throw new Error('Token is not yet valid')
  }

  // Verify required scope
  if (requiredScope && (!payload.scope || !payload.scope.includes(requiredScope))) {
    throw new Error(`Missing required scope: ${requiredScope}`)
  }
}

/**
 * Validate the shape of a raw JWT payload before trusting its fields.
 *
 * `jose`'s `jwtVerify` returns `JWTPayload` where all standard claims are optional.
 * This function asserts that every field we rely on is present and of the correct type
 * so that downstream code never operates on unexpected `undefined` / wrong-type values.
 *
 * @throws {Error} If any required or typed claim is absent or of the wrong type.
 */
function validatePayloadShape(payload: unknown): asserts payload is AuthPayload {
  if (typeof payload !== 'object' || payload === null) {
    throw new Error('JWT payload is missing or not an object')
  }

  const p = payload as Record<string, unknown>

  // `sub` (subject / user ID) is required — the rest of the library depends on it.
  if (typeof p.sub !== 'string' || p.sub.trim() === '') {
    throw new Error('JWT payload is missing required field "sub" (user ID)')
  }

  // `iss` (issuer) is required. Logto OIDC tokens always include it and
  // verifyTokenClaims enforces the exact value. Making it required here ensures
  // the issuer check can never be silently skipped if call order were ever changed.
  if (typeof p.iss !== 'string' || p.iss.trim() === '') {
    throw new Error('JWT payload is missing required field "iss" (issuer)')
  }

  if (p.exp !== undefined && typeof p.exp !== 'number') {
    throw new Error('JWT payload field "exp" must be a number')
  }
  if (p.nbf !== undefined && typeof p.nbf !== 'number') {
    throw new Error('JWT payload field "nbf" must be a number')
  }
  if (p.aud !== undefined) {
    const aud = p.aud
    const isValid =
      typeof aud === 'string' || (Array.isArray(aud) && aud.every(a => typeof a === 'string'))
    if (!isValid) {
      throw new Error('JWT payload field "aud" must be a string or string[]')
    }
  }
  // `scope` is typed as required in AuthPayload but may be absent in some token
  // varieties (e.g. M2M tokens with no scopes). Validate the type if present so
  // downstream string operations on `payload.scope` never receive a non-string.
  if (p.scope !== undefined && typeof p.scope !== 'string') {
    throw new Error('JWT payload field "scope" must be a string')
  }
}

/**
 * Classify whether an error indicates a JWKS key-rotation failure.
 *
 * Only errors that definitively point to a stale cached JWKS — a missing kid
 * or a failed signature — should trigger cache invalidation and a retry.
 *
 * Errors that indicate bad token claims (audience, issuer, expiry, scope) must
 * NOT be retried; they will return the same error after a fresh JWKS fetch and
 * retrying only adds latency and unnecessary network requests.
 *
 * Checks our own `findMatchingKey` error messages by prefix (not free-text substring)
 * and jose structured error codes via the `.code` property so the check stays correct
 * across jose version changes and is immune to incidental keyword matches in claim
 * error messages (e.g. "Expected: api-key, Got: ..." containing "key").
 */
function isKeyRotationError(error: unknown): boolean {
  if (!(error instanceof Error)) return false

  // Our own findMatchingKey errors — plain Error, not jose errors.
  // Check by prefix so we don't accidentally match other messages.
  if (
    error.message.startsWith('No keys found in JWKS') ||
    error.message.startsWith('Key with kid')
  ) {
    return true
  }

  // jose structured error codes.
  const code = (error as { code?: unknown }).code
  return (
    code === 'ERR_JWKS_NO_MATCHING_KEY' ||
    code === 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED'
  )
}

/**
 * Verify a token against a specific set of JWKS keys.
 *
 * Separated from `verifyLogtoToken` so that the outer function can call this helper
 * twice when JWKS cache invalidation + retry is needed (key rotation scenario).
 *
 * @throws {Error} On key-lookup failure, signature verification failure, or claims mismatch.
 */
async function verifyWithKeys(
  token: string,
  header: Record<string, unknown>,
  keys: JwkKey[],
  options: VerifyAuthOptions,
): Promise<AuthContext> {
  const kid = typeof header.kid === 'string' ? header.kid : undefined
  const alg = typeof header.alg === 'string' ? header.alg : undefined

  const jwk = findMatchingKey(keys, kid, alg)
  const publicKey = await importJWK(jwk, alg || 'RS256')
  const { payload: rawPayload } = await jwtVerify(token, publicKey)

  // Validate payload shape before trusting any field (task 3.5)
  validatePayloadShape(rawPayload)

  // Validate all business claims (issuer, audience, expiry, scope)
  verifyTokenClaims(rawPayload, options)

  return {
    userId: rawPayload.sub,
    isAuthenticated: true,
    payload: rawPayload,
    isGuest: false,
  }
}

/**
 * Verify JWT Token from Logto
 *
 * Verifies a Logto JWT token by:
 * 1. Decoding the JWT header to extract key ID (kid) and algorithm
 * 2. Fetching the JWKS (JSON Web Key Set) from Logto's OIDC endpoint (cached, 5 min TTL)
 * 3. Finding the matching public key
 * 4. Verifying the token signature
 * 5. Validating the payload shape (all required/typed fields present)
 * 6. Validating all claims (issuer, audience, expiration, scope, etc.)
 *
 * Key-rotation resilience: if step 3 or 4 fails with a key-related error (e.g. Logto
 * rotated its signing keys and the cached JWKS no longer contains the new `kid`), the
 * cache entry is invalidated and a single retry is attempted with freshly fetched JWKS.
 * Claims errors (wrong audience, expired token, etc.) are NOT retried.
 *
 * @param {string} token - The JWT token to verify (typically from Authorization header or cookie)
 * @param {VerifyAuthOptions} options - Verification options
 * @param {string} options.logtoUrl - Logto server URL (e.g., 'https://tenant.logto.app')
 * @param {string | string[]} [options.audience] - Expected token audience or audiences (resource/API identifier)
 * @param {string} [options.requiredScope] - Required scope that must be present in token
 * @param {string} [options.cookieName] - Cookie name for token storage (default: 'logto_authtoken')
 * @param {boolean} [options.allowGuest] - Allow unauthenticated guest access
 *
 * @returns {Promise<AuthContext>} Authentication context with user ID, authentication status, and token payload
 *
 * @example
 * try {
 *   const auth = await verifyLogtoToken(token, {
 *     logtoUrl: 'https://tenant.logto.app',
 *     audience: 'urn:logto:resource:api'
 *   });
 *   console.log(auth.userId); // User ID from token
 * } catch (error) {
 *   console.error('Token verification failed:', error.message);
 * }
 *
 * @throws {Error} If token format is invalid, signature verification fails, or claims validation fails
 */
export async function verifyLogtoToken(token: string, options: VerifyAuthOptions): Promise<AuthContext> {
  const { logtoUrl } = options
  // Derive the JWKS URL via the shared helper so this matches the cache key
  // used by fetchJWKS — guarantees the delete() on retry hits the right entry.
  const jwksUrl = `${buildOidcBaseUrl(logtoUrl)}/jwks`

  try {
    // Decode JWT header to get kid and alg
    const [headerBase64] = token.split('.')
    if (!headerBase64) {
      throw new Error('Invalid JWT format')
    }

    const headerJson = base64UrlDecode(headerBase64)
    const header = JSON.parse(headerJson) as Record<string, unknown>

    // Fetch JWKS from Logto (uses in-memory cache when within 5-minute TTL)
    const keys = await fetchJWKS(logtoUrl)

    try {
      return await verifyWithKeys(token, header, keys, options)
    } catch (verifyError) {
      // Only retry for key-rotation errors (missing kid, signature mismatch).
      // Claims errors (audience, issuer, expiry, scope) are not retried —
      // they would produce the same failure after a fresh JWKS fetch.
      if (!isKeyRotationError(verifyError)) {
        throw verifyError
      }

      // Invalidate the stale cache entry and fetch a fresh JWKS, then retry once.
      console.warn('[verifyLogtoToken] Key/signature error — invalidating JWKS cache and retrying with fresh keys')
      jwksCache.delete(jwksUrl)
      const freshKeys = await fetchJWKS(logtoUrl)
      return await verifyWithKeys(token, header, freshKeys, options)
    }
  } catch (error) {
    throw new Error(`Token verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Create Express Middleware for Logto Authentication
 *
 * Creates Express middleware that automatically extracts and verifies Logto JWT tokens
 * from incoming requests. Handles token extraction from cookies or Authorization headers,
 * validates tokens, and attaches authentication context to the request object.
 *
 * @param {VerifyAuthOptions} options - Middleware configuration options
 * @param {string} options.logtoUrl - Logto server URL
 * @param {string | string[]} [options.audience] - Expected token audience or audiences
 * @param {string} [options.requiredScope] - Required scope
 * @param {string} [options.cookieName='logto_authtoken'] - Cookie name for token
 * @param {boolean} [options.allowGuest=false] - Allow unauthenticated access as guest
 *
 * @returns {Function} Express middleware function
 *
 * @example
 * import express from 'express';
 * import { createExpressAuthMiddleware } from '@ouim/simple-logto/backend';
 *
 * const app = express();
 *
 * // Apply middleware to all routes
 * app.use(createExpressAuthMiddleware({
 *   logtoUrl: process.env.LOGTO_ENDPOINT,
 *   audience: 'urn:logto:resource:api'
 * }));
 *
 * // Access authenticated user
 * app.get('/api/me', (req, res) => {
 *   if (req.auth?.isAuthenticated) {
 *     res.json({ userId: req.auth.userId });
 *   } else {
 *     res.status(401).json({ error: 'Unauthorized' });
 *   }
 * });
 *
 * @example
 * // Allow guest access
 * app.use(createExpressAuthMiddleware({
 *   logtoUrl: process.env.LOGTO_ENDPOINT,
 *   allowGuest: true
 * }));
 *
 * // Distinguish authenticated vs guest users
 * app.get('/api/data', (req, res) => {
 *   if (req.auth?.isGuest) {
 *     res.json({ data: 'limited data for guests' });
 *   } else {
 *     res.json({ data: 'full data for authenticated users' });
 *   }
 * });
 */
export function createExpressAuthMiddleware(options: VerifyAuthOptions) {
  // We wrap the actual logic in a handler so that we can ensure cookies are parsed
  const parser = cookieParser()

  const handler = async (req: ExpressRequest, res: ExpressResponse, next: ExpressNext) => {
    try {
      // Try to get token from cookie first, then from Authorization header
      let token = extractTokenFromCookies(req.cookies, options.cookieName)

      if (!token) {
        token = extractBearerTokenFromHeaders(req.headers)
      }

      if (!token) {
        // If allowGuest is enabled, check for guest cookie
        if (options.allowGuest) {
          const guestId = extractGuestTokenFromCookies(req.cookies)

          req.auth = {
            userId: null,
            isAuthenticated: false,
            payload: null,
            isGuest: true,
            guestId,
          }

          return next()
        }

        return res.status(401).json({
          error: 'Authentication required',
          message: 'No token found in cookies or Authorization header',
        })
      }

      const authContext = await verifyLogtoToken(token, options)
      req.auth = authContext

      return next()
    } catch (error) {
      // If allowGuest is enabled and token verification fails, fall back to guest
      if (options.allowGuest) {
        const guestId = extractGuestTokenFromCookies(req.cookies)

        req.auth = {
          userId: null,
          isAuthenticated: false,
          payload: null,
          isGuest: true,
          guestId: guestId || undefined,
        }

        return next()
      }

      return res.status(401).json({
        error: 'Authentication failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  // Returned middleware ensures cookies are parsed if not already available
  return async (req: ExpressRequest, res: ExpressResponse, next: ExpressNext) => {
    if (!req.cookies) {
      parser(req as Parameters<typeof parser>[0], res as Parameters<typeof parser>[1], async err => {
        if (err) {
          return next(err)
        }
        await handler(req, res, next)
      })
    } else {
      await handler(req, res, next)
    }
  }
}

/**
 * Verify Next.js Request Authentication
 *
 * Verifies Logto authentication for Next.js API routes and middleware.
 * Extracts JWT from cookies or Authorization header, verifies the token,
 * and returns authentication context.
 *
 * @param {NextRequest} request - Next.js request object
 * @param {VerifyAuthOptions} options - Verification options
 * @param {string} options.logtoUrl - Logto server URL
 * @param {string | string[]} [options.audience] - Expected token audience or audiences
 * @param {string} [options.requiredScope] - Required scope
 * @param {string} [options.cookieName='logto_authtoken'] - Cookie name
 * @param {boolean} [options.allowGuest] - Allow unauthenticated guest access
 *
 * @returns {Promise<{success: true, auth: AuthContext} | {success: false, error: string, auth?: AuthContext}>}
 * - `success: true` — token verified **or** a valid guest session (`allowGuest: true`).
 *   Always check `result.auth.isAuthenticated` (or `result.auth.isGuest`) to distinguish
 *   authenticated users from guests; do NOT rely on `success` alone as an auth gate.
 * - `success: false` — no token found and guest mode is disabled, or an unrecoverable error.
 *
 * @example
 * // In a Next.js API route — reject unauthenticated requests
 * import { verifyNextAuth } from '@ouim/simple-logto/backend';
 *
 * export async function GET(request) {
 *   const result = await verifyNextAuth(request, {
 *     logtoUrl: process.env.LOGTO_ENDPOINT,
 *     audience: 'urn:logto:resource:api'
 *   });
 *
 *   if (!result.success) {
 *     return new Response(JSON.stringify({ error: result.error }), { status: 401 });
 *   }
 *
 *   return new Response(JSON.stringify({
 *     userId: result.auth.userId,
 *     authenticated: result.auth.isAuthenticated
 *   }));
 * }
 *
 * @example
 * // In Next.js middleware — allow guests, block fully unauthenticated requests
 * import { NextRequest, NextResponse } from 'next/server';
 * import { verifyNextAuth } from '@ouim/simple-logto/backend';
 *
 * export async function middleware(request: NextRequest) {
 *   const result = await verifyNextAuth(request, {
 *     logtoUrl: process.env.LOGTO_ENDPOINT,
 *     allowGuest: true
 *   });
 *
 *   // success:true covers both authenticated users and guests when allowGuest is set.
 *   // Use auth.isAuthenticated (or auth.isGuest) to distinguish the two cases.
 *   if (result.success && result.auth.isAuthenticated) {
 *     return NextResponse.next();
 *   }
 *   if (result.success && result.auth.isGuest) {
 *     return NextResponse.next(); // allow guest through, or redirect to limited view
 *   }
 *
 *   return NextResponse.redirect(new URL('/login', request.url));
 * }
 */
export async function verifyNextAuth(
  request: NextRequest,
  options: VerifyAuthOptions,
): Promise<{ success: true; auth: AuthContext } | { success: false; error: string; auth?: AuthContext }> {
  try {
    // Try to get token from cookie first, then from Authorization header
    let token = extractTokenFromCookies(request.cookies, options.cookieName)

    if (!token) {
      token = extractBearerTokenFromHeaders(request.headers)
    }

    if (!token) {
      // If allowGuest is enabled, check for existing guest cookie
      if (options.allowGuest) {
        const guestId = extractGuestTokenFromCookies(request.cookies)

        const guestAuth: AuthContext = {
          userId: null,
          isAuthenticated: false,
          payload: null,
          isGuest: true,
          guestId: guestId || undefined,
        }

        // A valid guest session is a success — callers should use `auth.isGuest` to
        // distinguish guests from authenticated users rather than checking `success`.
        return {
          success: true,
          auth: guestAuth,
        }
      }

      return {
        success: false,
        error: 'No token found in cookies or Authorization header',
      }
    }

    const authContext = await verifyLogtoToken(token, options)

    return {
      success: true,
      auth: authContext,
    }
  } catch (error) {
    // If allowGuest is enabled and token verification fails, fall back to guest.
    // A degraded guest session is still a valid session — callers use `auth.isGuest`
    // to distinguish guests from authenticated users.
    if (options.allowGuest) {
      const guestId = extractGuestTokenFromCookies(request.cookies)
      const verificationError = error instanceof Error ? error.message : 'Unknown error'

      // Log so the failure isn't completely silent during debugging
      console.warn(`[verifyNextAuth] Token verification failed, falling back to guest: ${verificationError}`)

      const guestAuth: AuthContext = {
        userId: null,
        isAuthenticated: false,
        payload: null,
        isGuest: true,
        guestId: guestId || undefined,
      }

      return {
        success: true,
        auth: guestAuth,
      }
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Generic Token/Request Authentication Verification
 *
 * Universal verification function that works with any Node.js environment.
 * Accepts either a JWT token string directly or a request object (Express, Next.js, etc.)
 * and verifies the authentication.
 *
 * @param {string | {cookies?: any, headers?: any}} tokenOrRequest - Either:
 *   - A JWT token string to verify directly
 *   - A request-like object with cookies and headers properties
 * @param {VerifyAuthOptions} options - Verification options
 * @param {string} options.logtoUrl - Logto server URL
 * @param {string | string[]} [options.audience] - Expected token audience or audiences
 * @param {string} [options.requiredScope] - Required scope
 * @param {string} [options.cookieName='logto_authtoken'] - Cookie name
 * @param {boolean} [options.allowGuest] - Allow unauthenticated guest access
 *
 * @returns {Promise<AuthContext>} Authentication context
 *
 * @example
 * // Verify a token directly
 * const auth = await verifyAuth(jwtToken, {
 *   logtoUrl: 'https://tenant.logto.app',
 *   audience: 'urn:logto:resource:api'
 * });
 *
 * @example
 * // Verify from a request object
 * const auth = await verifyAuth(request, {
 *   logtoUrl: process.env.LOGTO_ENDPOINT,
 *   allowGuest: true
 * });
 *
 * @throws {Error} If token verification fails or no token found and guest mode disabled
 */
export async function verifyAuth(
  tokenOrRequest: string | { cookies?: unknown; headers?: unknown },
  options: VerifyAuthOptions,
): Promise<AuthContext> {
  let token: string

  if (typeof tokenOrRequest === 'string') {
    token = tokenOrRequest
  } else {
    // Extract from request object
    const extractedToken =
      extractTokenFromCookies(tokenOrRequest.cookies, options.cookieName) || extractBearerTokenFromHeaders(tokenOrRequest.headers)

    if (!extractedToken) {
      // If allowGuest is enabled, check for guest cookie
      if (options.allowGuest) {
        const guestId = extractGuestTokenFromCookies(tokenOrRequest.cookies)

        return {
          userId: null,
          isAuthenticated: false,
          payload: null,
          isGuest: true,
          guestId: guestId || undefined,
        }
      }

      throw new Error('No token found in request')
    }

    token = extractedToken
  }

  try {
    return await verifyLogtoToken(token, options)
  } catch (error) {
    // If allowGuest is enabled and token verification fails, fall back to guest
    if (options.allowGuest && typeof tokenOrRequest === 'object') {
      const guestId = extractGuestTokenFromCookies(tokenOrRequest.cookies)

      return {
        userId: null,
        isAuthenticated: false,
        payload: null,
        isGuest: true,
        guestId: guestId || undefined,
      }
    }

    throw error
  }
}

/**
 * Build a `Set-Cookie` header string that sets the auth token as an `HttpOnly` cookie.
 *
 * ## Why this exists — the XSS / non-httpOnly problem
 *
 * The client-side `jwtCookieUtils.saveToken()` sets the auth token from JavaScript.
 * Because `HttpOnly` can only be set by the **server** (via a `Set-Cookie` response
 * header), the client-set cookie is readable by any same-origin JavaScript, including
 * scripts injected by an XSS attack.
 *
 * If your deployment includes a backend (Express, Next.js, etc.) that handles the
 * post-authentication callback, you can upgrade security by having the server re-set
 * the cookie with `HttpOnly`. The browser will then attach it to every request
 * automatically and JavaScript can no longer read it.
 *
 * ## Recommended flow
 *
 * ```
 * 1. Frontend CallbackPage exchanges the auth code via Logto SDK (as normal).
 * 2. Frontend sends the obtained JWT to a backend endpoint, e.g. POST /api/session.
 * 3. Backend verifies the JWT with verifyLogtoToken(), then calls buildAuthCookieHeader()
 *    and sets it on the response.
 * 4. The browser now holds an HttpOnly cookie — the frontend no longer needs to store
 *    the JWT in its own document.cookie.
 * ```
 *
 * @param {string} token - The verified JWT string to store in the cookie.
 * @param {object} [options]
 * @param {string} [options.cookieName='logto_authtoken'] - Cookie name. Must match the
 *   `cookieName` used by the backend middleware so it finds the token on subsequent requests.
 * @param {number} [options.maxAge=604800] - Cookie lifetime in **seconds** (default: 7 days).
 * @param {string} [options.domain] - Cookie domain (omit to use the current host).
 * @param {string} [options.path='/'] - Cookie path.
 * @param {'Strict'|'Lax'|'None'} [options.sameSite='Strict'] - SameSite policy.
 *   Use `'None'` only if you need the cookie on cross-site requests (requires `Secure`).
 *
 * @returns {string} A complete `Set-Cookie` header value ready to pass to `res.setHeader`.
 *
 * @example
 * // Express — upgrade to HttpOnly after verifying the token
 * import express from 'express';
 * import { verifyLogtoToken, buildAuthCookieHeader } from '@ouim/simple-logto/backend';
 *
 * app.post('/api/session', async (req, res) => {
 *   const token = req.body.token; // JWT sent from the frontend after Logto callback
 *   const auth = await verifyLogtoToken(token, { logtoUrl: process.env.LOGTO_ENDPOINT });
 *   const cookie = buildAuthCookieHeader(token);
 *   res.setHeader('Set-Cookie', cookie);
 *   res.json({ userId: auth.userId });
 * });
 *
 * @example
 * // Next.js Route Handler — same pattern
 * import { verifyLogtoToken, buildAuthCookieHeader } from '@ouim/simple-logto/backend';
 *
 * export async function POST(request: Request) {
 *   const { token } = await request.json();
 *   const auth = await verifyLogtoToken(token, { logtoUrl: process.env.LOGTO_ENDPOINT });
 *   const cookie = buildAuthCookieHeader(token);
 *   return new Response(JSON.stringify({ userId: auth.userId }), {
 *     headers: { 'Content-Type': 'application/json', 'Set-Cookie': cookie },
 *   });
 * }
 */
export function buildAuthCookieHeader(
  token: string,
  options: {
    cookieName?: string
    maxAge?: number
    domain?: string
    path?: string
    sameSite?: 'Strict' | 'Lax' | 'None'
  } = {},
): string {
  const {
    cookieName = 'logto_authtoken',
    maxAge = 7 * 24 * 60 * 60, // 7 days in seconds
    domain,
    path = '/',
    sameSite = 'Strict',
  } = options

  // JWTs use base64url encoding and contain only A-Za-z0-9-_.= characters,
  // all of which are safe in cookie values. Do NOT encode the token here:
  // extractTokenFromCookies reads through cookie-parser (or Next.js cookies
  // API) which already decodes percent-encoded values. Encoding here would
  // cause double-decoding and corrupt the token on the read path.
  let header = `${cookieName}=${token}; Max-Age=${maxAge}; Path=${path}; HttpOnly; Secure; SameSite=${sameSite}`
  if (domain) header += `; Domain=${domain}`
  return header
}
