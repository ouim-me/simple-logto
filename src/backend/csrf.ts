/**
 * CSRF Protection Helpers for `@ouim/simple-logto`
 *
 * Implements the **Double-Submit Cookie** pattern — the most portable stateless
 * CSRF defence that requires no server-side session storage.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THREAT MODEL
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * WHAT IS CSRF?
 * A Cross-Site Request Forgery attack tricks a victim's authenticated browser
 * into making a state-changing request (POST/PUT/DELETE) to your API.  Because
 * browsers automatically include cookies with cross-origin requests, the server
 * sees what appears to be a legitimate authenticated request even though the
 * user never intended to make it.
 *
 * JWT cookies are NOT immune.  If `logto_authtoken` is a `SameSite=Lax` cookie
 * (the browser default when `SameSite` is omitted), cross-site top-level
 * navigations (e.g. a form POST from an attacker's page) will include it.
 * Even `SameSite=Strict` cookies are sent in some redirect flows and are not
 * universally enforced across all browser versions.
 *
 * HOW THE DOUBLE-SUBMIT COOKIE PATTERN WORKS:
 *   1. The server generates a random token and sets it in a **non-HttpOnly**
 *      cookie (the browser's same-origin policy keeps it readable only to your
 *      own JavaScript, not to scripts on other origins).
 *   2. For every mutating request (POST, PUT, PATCH, DELETE), client-side JS
 *      reads the CSRF cookie value and sends it as a custom request header
 *      (e.g. `X-CSRF-Token`).
 *   3. The server middleware compares the header value to the cookie value.
 *      A mismatch → 403 Forbidden.
 *
 * WHY AN ATTACKER CAN'T FORGE THIS:
 *   - Cross-origin JavaScript cannot read cookies from your domain
 *     (same-origin policy).
 *   - Cross-origin requests cannot set custom headers without a successful
 *     CORS preflight, which your server controls.
 *   - An attacker who can read your cookies has already achieved XSS on your
 *     domain — CSRF is no longer the threat at that point.
 *
 * LIMITATIONS / NOTES:
 *   - CSRF protection is complementary to, not a replacement for, a strict
 *     Content-Security-Policy and XSS hardening.
 *   - `SameSite=Strict` on the *auth* cookie provides strong CSRF protection
 *     on its own for modern browsers: the browser withholds the cookie on all
 *     cross-site requests, including cross-site form POSTs. The double-submit
 *     pattern here is defence-in-depth for older browsers and programmatic
 *     enforcement when you want to verify CSRF explicitly in middleware logic.
 *   - The CSRF cookie is intentionally **not** `HttpOnly` — the client JS
 *     must be able to read it.  Do not store anything sensitive in it.
 *   - Safe HTTP methods (GET, HEAD, OPTIONS, TRACE) are exempt from CSRF
 *     validation.  Ensure your API does not use GET for state changes.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUICK-START — Express
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * ```ts
 * import express from 'express';
 * import { createExpressAuthMiddleware } from '@ouim/simple-logto/backend';
 * import { createCsrfMiddleware, generateCsrfToken, buildCsrfCookieHeader } from '@ouim/simple-logto/backend';
 *
 * const app = express();
 *
 * // Mount CSRF middleware on all routes that mutate state.
 * // The middleware sets the CSRF cookie on GET requests (if absent)
 * // and validates it on POST/PUT/PATCH/DELETE.
 * app.use(createCsrfMiddleware());
 *
 * // Auth middleware can be layered on top.
 * app.use('/api', createExpressAuthMiddleware({ logtoUrl: process.env.LOGTO_ENDPOINT }));
 * ```
 *
 * Client-side fetch helper:
 * ```ts
 * function getCsrfToken(): string {
 *   return document.cookie
 *     .split('; ')
 *     .find(c => c.startsWith('logto_csrf_token='))
 *     ?.split('=')[1] ?? '';
 * }
 *
 * // HTTP headers are case-insensitive; use lowercase to match CSRF_HEADER_NAME
 * await fetch('/api/data', {
 *   method: 'POST',
 *   headers: { 'x-csrf-token': getCsrfToken(), 'Content-Type': 'application/json' },
 *   body: JSON.stringify({ ... }),
 * });
 * ```
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUICK-START — Next.js
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * ```ts
 * // app/api/data/route.ts
 * import { NextRequest, NextResponse } from 'next/server';
 * import { verifyCsrfToken, generateCsrfToken, buildCsrfCookieHeader } from '@ouim/simple-logto/backend';
 *
 * // GET — issue a fresh CSRF token
 * export async function GET() {
 *   const token = generateCsrfToken();
 *   return new Response(JSON.stringify({ csrfToken: token }), {
 *     headers: { 'Set-Cookie': buildCsrfCookieHeader(token) },
 *   });
 * }
 *
 * // POST — validate the CSRF token before processing
 * export async function POST(request: NextRequest) {
 *   const csrf = verifyCsrfToken(request);
 *   if (!csrf.valid) {
 *     return NextResponse.json({ error: csrf.error }, { status: 403 });
 *   }
 *   // ... process the request
 * }
 * ```
 */

import { randomUUID } from 'node:crypto'
import type { ExpressRequest, ExpressResponse, ExpressNext, NextRequest } from './types.js'

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Default name for the CSRF token cookie (non-HttpOnly, readable by JS). */
export const CSRF_COOKIE_NAME = 'logto_csrf_token'

/** Default request header that clients must send the CSRF token in. */
export const CSRF_HEADER_NAME = 'x-csrf-token'

/**
 * HTTP methods that do not mutate server state and therefore do not require
 * CSRF validation (per RFC 7231 §4.2.1 — safe methods).
 */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS', 'TRACE'])

// ─────────────────────────────────────────────────────────────────────────────
// Token generation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a cryptographically random CSRF token string.
 *
 * Uses `randomUUID` from `node:crypto` (available since Node.js 14.17,
 * works in both CJS and ESM builds). Provides 122 bits of entropy —
 * sufficient for CSRF tokens.
 *
 * @example
 * import { generateCsrfToken } from '@ouim/simple-logto/backend';
 *
 * const csrfToken = generateCsrfToken();
 * // Store it in a cookie or send it to the client in a bootstrap response
 */
export function generateCsrfToken(): string {
  return randomUUID()
}

// ─────────────────────────────────────────────────────────────────────────────
// Cookie header builder
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a `Set-Cookie` header string for the CSRF token cookie.
 *
 * The cookie is deliberately **not** `HttpOnly` — client-side JavaScript must
 * be able to read this value and send it as a request header.  An attacker on
 * a different origin cannot read it because of the browser's same-origin policy.
 *
 * @param {string} token - The CSRF token value (from `generateCsrfToken()`).
 * @param {object} [options]
 * @param {string} [options.cookieName='logto_csrf_token'] - Cookie name.
 * @param {number} [options.maxAge=86400] - Cookie lifetime in seconds (default: 1 day).
 * @param {string} [options.domain] - Cookie domain (omit for current host).
 * @param {string} [options.path='/'] - Cookie path.
 * @param {'Strict'|'Lax'} [options.sameSite='Strict'] - SameSite policy.
 *   `'None'` is intentionally excluded: CSRF cookies sent to third parties
 *   defeat the purpose of the double-submit pattern.
 *
 * @returns {string} A complete `Set-Cookie` header value.
 *
 * @example
 * import { generateCsrfToken, buildCsrfCookieHeader } from '@ouim/simple-logto/backend';
 *
 * const token = generateCsrfToken();
 * const cookie = buildCsrfCookieHeader(token, { sameSite: 'Strict' });
 * res.setHeader('Set-Cookie', cookie);
 */
export function buildCsrfCookieHeader(
  token: string,
  options: {
    cookieName?: string
    maxAge?: number
    domain?: string
    path?: string
    sameSite?: 'Strict' | 'Lax'
  } = {},
): string {
  const {
    cookieName = CSRF_COOKIE_NAME,
    maxAge = 24 * 60 * 60, // 1 day
    domain,
    path = '/',
    sameSite = 'Strict',
  } = options

  // Guard against header injection: CSRF tokens from generateCsrfToken() are
  // UUIDs and contain only hex digits and hyphens, but buildCsrfCookieHeader is
  // a public export that accepts arbitrary strings. Reject any value containing
  // characters that could break or inject additional Set-Cookie directives.
  if (/[\r\n;]/.test(token)) {
    throw new Error('CSRF token contains invalid characters (newline or semicolon)')
  }

  let header = `${cookieName}=${token}; Max-Age=${maxAge}; Path=${path}; Secure; SameSite=${sameSite}`
  if (domain) header += `; Domain=${domain}`
  return header
}

// ─────────────────────────────────────────────────────────────────────────────
// Express middleware
// ─────────────────────────────────────────────────────────────────────────────

/** Options for {@link createCsrfMiddleware}. */
export interface CsrfMiddlewareOptions {
  /** Cookie name to read/write the CSRF token. Default: `'logto_csrf_token'`. */
  cookieName?: string
  /** Request header clients must send the CSRF token in. Default: `'x-csrf-token'`. */
  headerName?: string
  /** Cookie domain to set when issuing a new CSRF token. */
  domain?: string
  /** Cookie path. Default: `'/'`. */
  path?: string
  /** Cookie `SameSite` policy. Default: `'Strict'`. */
  sameSite?: 'Strict' | 'Lax'
  /** Cookie lifetime in seconds. Default: `86400` (1 day). */
  maxAge?: number
}

/**
 * Express middleware that implements CSRF double-submit cookie protection.
 *
 * **Behaviour:**
 * - **Safe methods** (GET, HEAD, OPTIONS, TRACE): if no CSRF cookie is present,
 *   a new token is generated and set via `Set-Cookie`. The request is passed
 *   through unconditionally.
 * - **Unsafe methods** (POST, PUT, PATCH, DELETE, …): the `X-CSRF-Token` header
 *   value is compared to the CSRF cookie value.  A mismatch returns `403 Forbidden`.
 *
 * Mount this middleware **before** your auth middleware so CSRF errors are caught
 * even on unauthenticated requests (defence-in-depth).
 *
 * @example
 * import { createCsrfMiddleware } from '@ouim/simple-logto/backend';
 *
 * // Apply globally
 * app.use(createCsrfMiddleware());
 *
 * // Apply only to API routes
 * app.use('/api', createCsrfMiddleware({ sameSite: 'Lax' }));
 */
export function createCsrfMiddleware(options: CsrfMiddlewareOptions = {}) {
  const {
    cookieName = CSRF_COOKIE_NAME,
    headerName = CSRF_HEADER_NAME,
    domain,
    path = '/',
    sameSite = 'Strict',
    maxAge = 24 * 60 * 60,
  } = options

  return (req: ExpressRequest, res: ExpressResponse, next: ExpressNext): void => {
    // req is Express Request at runtime — it has `.method`
    const method = ((req as unknown as { method?: string }).method ?? 'GET').toUpperCase()

    if (SAFE_METHODS.has(method)) {
      // Ensure a CSRF token cookie exists for the client to read on future requests.
      if (!req.cookies?.[cookieName]) {
        const token = generateCsrfToken()
        const cookieHeader = buildCsrfCookieHeader(token, { cookieName, maxAge, domain, path, sameSite })
        if (typeof res.setHeader === 'function') {
          res.setHeader('Set-Cookie', cookieHeader)
        }
      }
      return next()
    }

    // Unsafe method — validate the double-submit token.
    const cookieToken = req.cookies?.[cookieName]
    const headerToken = (req as unknown as { headers?: Record<string, string | string[] | undefined> }).headers?.[headerName]
    const headerTokenStr = Array.isArray(headerToken) ? headerToken[0] : headerToken

    if (!cookieToken || !headerTokenStr || cookieToken !== headerTokenStr) {
      res.status(403).json({
        error: 'CSRF validation failed',
        message: `Include the '${headerName}' request header with the value ` + `from the '${cookieName}' cookie.`,
      })
      return
    }

    return next()
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Next.js helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Result returned by {@link verifyCsrfToken}. */
export interface CsrfVerifyResult {
  /** `true` if the CSRF token is present and matches. */
  valid: boolean
  /** Human-readable reason for failure (only set when `valid` is `false`). */
  error?: string
}

/**
 * Verify the CSRF double-submit token for a Next.js request.
 *
 * Compares the value in the `X-CSRF-Token` request header against the
 * `logto_csrf_token` cookie.  Returns `{ valid: true }` on success or
 * `{ valid: false, error: '...' }` on failure.
 *
 * Intended for use in Next.js Route Handlers and Middleware for mutating
 * endpoints (POST, PUT, PATCH, DELETE).
 *
 * @param {NextRequest} request - The incoming Next.js request object.
 * @param {object} [options]
 * @param {string} [options.cookieName='logto_csrf_token'] - Cookie name to read.
 * @param {string} [options.headerName='x-csrf-token'] - Header name to read.
 *
 * @returns {CsrfVerifyResult}
 *
 * @example
 * import { verifyCsrfToken } from '@ouim/simple-logto/backend';
 *
 * export async function POST(request: NextRequest) {
 *   const csrf = verifyCsrfToken(request);
 *   if (!csrf.valid) {
 *     return NextResponse.json({ error: csrf.error }, { status: 403 });
 *   }
 *   // proceed with request handling
 * }
 */
export function verifyCsrfToken(request: NextRequest, options: { cookieName?: string; headerName?: string } = {}): CsrfVerifyResult {
  const { cookieName = CSRF_COOKIE_NAME, headerName = CSRF_HEADER_NAME } = options

  const cookieToken = request.cookies.get(cookieName)?.value
  const headerToken = request.headers.get(headerName)

  if (!cookieToken) {
    return {
      valid: false,
      error: `CSRF cookie '${cookieName}' not found. Ensure GET requests are made first to receive the CSRF cookie.`,
    }
  }

  if (!headerToken) {
    return {
      valid: false,
      error: `Missing '${headerName}' request header. Read the '${cookieName}' cookie value and send it in this header.`,
    }
  }

  // NOTE: This comparison is not timing-safe (not using timingSafeEqual).
  // For the double-submit cookie pattern, timing attacks are not a practical
  // concern: an attacker cannot observe server response times on cross-origin
  // requests (blocked by the browser's same-origin policy), and brute-forcing
  // a 122-bit UUID is computationally infeasible regardless of timing leakage.
  if (cookieToken !== headerToken) {
    return {
      valid: false,
      error: 'CSRF token mismatch. The header value does not match the cookie value.',
    }
  }

  return { valid: true }
}
