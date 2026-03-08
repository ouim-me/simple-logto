import { importJWK, jwtVerify } from 'jose'
import type { AuthContext, AuthPayload, VerifyAuthOptions, ExpressRequest, ExpressResponse, ExpressNext, NextRequest } from './types'
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
 * Extract guest token from cookie
 */
function extractGuestTokenFromCookies(cookies: unknown, cookieName: string = 'guest_logto_authtoken'): string | null {
  if (isNextCookieStore(cookies)) {
    // Next.js cookies
    const cookie = cookies.get(cookieName)
    return cookie?.value || generateUUID()
  } else if (isExpressCookieStore(cookies)) {
    // Express cookies
    return cookies[cookieName] || generateUUID()
  }
  return generateUUID()
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
  // Ensure logtoUrl has no trailing slash
  const normalizedLogtoUrl = logtoUrl.replace(/\/+$/, '')
  const jwksUrl = `${normalizedLogtoUrl}/oidc/jwks`
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

  const expectedIssuer = new URL(`oidc`, logtoUrl).toString()

  // Verify issuer
  if (payload.iss !== expectedIssuer) {
    throw new Error(`Invalid issuer. Expected: ${expectedIssuer}, Got: ${payload.iss}`)
  }

  // Verify audience
  if (audience && payload.aud !== audience) {
    throw new Error(`Invalid audience. Expected: ${audience}, Got: ${payload.aud}`)
  }

  // Verify expiration
  const now = Math.floor(Date.now() / 1000)
  if (exp && exp < now) {
    throw new Error('Token has expired')
  }

  // Verify not before
  if (nbf && nbf > now) {
    throw new Error('Token is not yet valid')
  }

  // Verify required scope
  if (requiredScope && (!payload.scope || !payload.scope.includes(requiredScope))) {
    throw new Error(`Missing required scope: ${requiredScope}`)
  }
}

/**
 * Verify JWT Token from Logto
 *
 * Verifies a Logto JWT token by:
 * 1. Decoding the JWT header to extract key ID (kid) and algorithm
 * 2. Fetching the JWKS (JSON Web Key Set) from Logto's OIDC endpoint
 * 3. Finding the matching public key
 * 4. Verifying the token signature
 * 5. Validating all claims (issuer, audience, expiration, scope, etc.)
 *
 * @param {string} token - The JWT token to verify (typically from Authorization header or cookie)
 * @param {VerifyAuthOptions} options - Verification options
 * @param {string} options.logtoUrl - Logto server URL (e.g., 'https://tenant.logto.app')
 * @param {string} [options.audience] - Expected token audience (resource/API identifier)
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

  try {
    // Decode JWT header to get kid and alg
    const [headerBase64] = token.split('.')
    if (!headerBase64) {
      throw new Error('Invalid JWT format')
    }

    const headerJson = base64UrlDecode(headerBase64)
    const header = JSON.parse(headerJson)

    // Fetch JWKS from Logto
    const keys = await fetchJWKS(logtoUrl)

    // Find matching key
    const jwk = findMatchingKey(keys, header.kid, header.alg)

    // Import the JWK for verification
    const publicKey = await importJWK(jwk, header?.alg || 'RS256')

    // Verify the JWT signature and get payload
    const { payload } = (await jwtVerify(token, publicKey)) as { payload: AuthPayload }

    // Manually verify all claims
    verifyTokenClaims(payload, options)

    return {
      userId: payload.sub,
      isAuthenticated: true,
      payload,
      isGuest: false,
    }
  } catch (error) {
    throw new Error(`Token verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

const generateUUID = () => {
  // Generate a random UUID (v4)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
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
 * @param {string} [options.audience] - Expected token audience
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
            guestId: guestId || undefined,
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
 * @param {string} [options.audience] - Expected token audience
 * @param {string} [options.requiredScope] - Required scope
 * @param {string} [options.cookieName='logto_authtoken'] - Cookie name
 * @param {boolean} [options.allowGuest] - Allow unauthenticated guest access
 *
 * @returns {Promise<{success: true, auth: AuthContext} | {success: false, error: string, auth?: AuthContext}>}
 * Object containing success flag, auth context, and error message if verification fails
 *
 * @example
 * // In a Next.js API route
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
 * // In Next.js middleware
 * import { NextRequest, NextResponse } from 'next/server';
 * import { verifyNextAuth } from '@ouim/simple-logto/backend';
 *
 * export async function middleware(request: NextRequest) {
 *   const result = await verifyNextAuth(request, {
 *     logtoUrl: process.env.LOGTO_ENDPOINT,
 *     allowGuest: true
 *   });
 *
 *   if (result.success && result.auth.isAuthenticated) {
 *     return NextResponse.next();
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

        return {
          success: false,
          error: 'No authentication token found',
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
    // If allowGuest is enabled and token verification fails, fall back to guest
    if (options.allowGuest) {
      const guestId = extractGuestTokenFromCookies(request.cookies)

      const guestAuth: AuthContext = {
        userId: null,
        isAuthenticated: false,
        payload: null,
        isGuest: true,
        guestId: guestId || undefined,
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
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
 * @param {string} [options.audience] - Expected token audience
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
