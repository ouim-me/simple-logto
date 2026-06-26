# Security & Advanced Features

This guide documents the security hardening features and advanced capabilities added in recent releases.

## Security Improvements

### 1. CSRF Protection

The library includes built-in CSRF protection helpers for backend routes using the double-submit cookie pattern. This provides defense-in-depth against CSRF attacks without additional dependencies.

**For Express.js:**

```javascript
import { createCsrfMiddleware } from '@ouim/logto-authkit/server'

const csrfMiddleware = createCsrfMiddleware({
  cookieName: 'logto_csrf_token', // optional
  headerName: 'x-csrf-token', // optional
})

// Use on your Express app
app.use(csrfMiddleware)

app.post('/api/state-change', (req, res) => {
  // CSRF token has been validated by middleware
  res.json({ success: true })
})
```

**For Next.js Route Handlers:**

```javascript
import { verifyCsrfToken } from '@ouim/logto-authkit/server'

export async function POST(request) {
  const csrfResult = verifyCsrfToken(request)

  if (!csrfResult.valid) {
    return Response.json({ error: csrfResult.error }, { status: 403 })
  }

  // Proceed with state-changing operation
  return Response.json({ success: true })
}
```

**How it works:** The double-submit cookie pattern works by:
1. Backend sets a CSRF token in a non-HttpOnly cookie (readable by JavaScript)
2. Frontend JavaScript reads the token and includes it in a request header
3. Backend verifies both the cookie and header match

This pattern is effective because an attacker cannot:
- Read the token from another origin (same-origin policy blocks it)
- Set the header from another origin (CORS restrictions)

**Limitations:** CSRF protection is one layer of defense. Combine with:
- Content Security Policy (CSP) to prevent script injection
- Secure cookies (HttpOnly, Secure, SameSite flags)
- Input validation and rate limiting

### 2. Enhanced Cookie Security

All authentication and guest identity cookies now use consistent security flags:

- **`Secure`** — Only transmitted over HTTPS
- **`SameSite=Strict`** — Not sent on cross-origin requests (prevents CSRF + some XSS vectors)
- **Expiry** — 30-day default cookie retention, with server-side verification of the JWT `exp` claim

```javascript
// Frontend (non-HttpOnly, JavaScript-readable)
import { jwtCookieUtils } from '@ouim/logto-authkit'

jwtCookieUtils.saveToken(token) // Uses Secure + SameSite=Strict

// Backend (HttpOnly upgrade recommended)
import { buildAuthCookieHeader } from '@ouim/logto-authkit/server'

const setCookieHeader = buildAuthCookieHeader(verifiedToken, {
  secure: true,
  sameSite: 'strict',
  httpOnly: true, // Backend can set this
})

res.setHeader('Set-Cookie', setCookieHeader)
```

### 3. XSS Limitation & Mitigation

The frontend cannot set `HttpOnly` cookies (by design — JavaScript cookies must be readable). This creates an XSS vulnerability window if your app has script injection flaws.

**Mitigation strategy:**
- Use your backend to upgrade the cookie to `HttpOnly` after verifying the token
- Implement strong CSP headers
- Use a security review process for third-party scripts

See `buildAuthCookieHeader` example above.

### 4. JWT Validation Hardening

The library validates JWT payload structure before use:

- `sub` (subject) must be a non-empty string
- `iss` (issuer) must match configured Logto URL
- `aud` (audience) must include your configured resource audience(s) — now supports both strings and arrays (RFC 7519)
- `exp` (expiry) and `nbf` (not before) are validated as numbers
- Missing or malformed claims trigger verification failure

### 5. JWKS Cache with Key Rotation Support

The 5-minute JWKS cache now intelligently invalidates when keys rotate:

```javascript
const authMiddleware = createExpressAuthMiddleware({
  logtoUrl: 'https://your-tenant.logto.app',
  audience: 'your-api-resource',
  // Cache is managed automatically and invalidated on signature failures
})
```

When signature verification fails, the library:
1. Invalidates the JWKS cache entry
2. Fetches fresh keys from Logto
3. Retries verification once

This avoids being locked out by a stale cache during key rotation, while still protecting against repeated verification failures.

### 6. postMessage Origin Verification

The popup sign-in flow includes hardened origin checks:

```javascript
// Two-layer verification in src/context.tsx
if (event.origin !== window.location.origin) return // Cross-origin check
if (event.source !== popup) return // Same-origin spoof check
```

This prevents:
- Cross-origin framing attacks
- Same-origin popup spoofing

## Advanced Features

### 1. Role & Permission Authorization

**Frontend (conditional rendering):**

```javascript
import { usePermission } from '@ouim/logto-authkit'

export function AdminPanel() {
  const canAdmin = usePermission('admin')
  const canViewReports = usePermission('reports:read')

  if (!canAdmin) return null

  return <div>Admin only content</div>
}
```

**Multi-permission checks:**

```javascript
// Require ALL permissions (default)
const isFullAdmin = usePermission(['users:write', 'settings:write'])

// Require ANY permission
const canEdit = usePermission(['content:write', 'content:publish'], { mode: 'any' })

// Custom permission claim keys
const hasRole = usePermission('admin', {
  claimKeys: ['roles', 'custom_permissions']
})
```

**Backend authorization:**

```javascript
import { checkRoleAuthorization, checkMultiScopeAuthorization } from '@ouim/logto-authkit/server'

export async function GET(request) {
  const authResult = await verifyNextAuth(request, {
    logtoUrl: process.env.LOGTO_URL,
    audience: 'your-api',
  })

  if (!authResult.success) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Check single role
  const userHasRole = checkRoleAuthorization(authResult.auth.payload, 'admin')
  if (!userHasRole) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Check multiple scopes (any match)
  const hasScopeAccess = checkMultiScopeAuthorization(
    authResult.auth.payload,
    ['users:write', 'users:admin'],
    'any' // or 'all'
  )

  return Response.json({ data: 'sensitive data' })
}
```

### 2. Provider Lifecycle Callbacks

Respond to authentication state changes:

```javascript
<AuthProvider
  config={logtoConfig}
  onTokenRefresh={({ expiresAt, newToken }) => {
    console.log('Token refreshed, expires:', expiresAt)
    // Update analytics, trigger dependent operations
  }}
  onAuthError={({ error, isTransient }) => {
    if (isTransient) {
      // Network blip, will retry automatically
      console.log('Transient auth error:', error.message)
    } else {
      // Real auth failure, might need user intervention
      console.error('Auth failed:', error.message)
    }
  }}
  onSignOut={({ reason }) => {
    console.log('User signed out:', reason) // 'user_initiated' | 'token_expired' | 'error'
    // Cleanup analytics sessions, redirect
  }}
>
  <App />
</AuthProvider>
```

### 3. Proactive Token Refresh

The provider automatically refreshes tokens before expiry (within the last 5 minutes):

```javascript
// No config needed — enabled by default
// AuthProvider will:
// 1. Decode token expiry time
// 2. Schedule refresh 5 minutes before expiry
// 3. Call onTokenRefresh callback when fresh token arrives
// 4. Fall back to on-demand refresh if scheduling fails
```

### 4. Configurable JWKS Cache (Backend)

For high-traffic backends, adjust caching:

```javascript
const authMiddleware = createExpressAuthMiddleware({
  logtoUrl: 'https://your-tenant.logto.app',
  audience: 'your-api',
  jwksCacheTTLMs: 300_000, // 5 minutes (default)
})

// Or globally
import { setJWKSCacheTTL } from '@ouim/logto-authkit/server'
setJWKSCacheTTL(600_000) // 10 minutes
```

### 5. Network Error Resilience

The provider distinguishes transient errors from auth failures:

- **Transient** (auto-retry with exponential backoff):
  - Network timeouts (`TypeError`, `networkerror`, `econnrefused`)
  - 5xx server errors
  - DNS failures
  - Retries up to 5 times with backoff (32 second cap)

- **Definite failures** (immediate sign-out):
  - Invalid token (`invalid_grant`, `invalid_token`)
  - Expired credentials (`token_expired`)
  - Revoked access (`access_denied`)

This prevents brief network outages from forcing re-authentication.

---

## Recommended Security Checklist

- [ ] Use HTTPS for all auth flows (Secure cookies require HTTPS)
- [ ] Set strong CSP headers to prevent script injection
- [ ] Implement backend cookie upgrade to HttpOnly after verification
- [ ] Use CSRF protection on all state-changing routes
- [ ] Validate permissions on both frontend (UX) and backend (security)
- [ ] Monitor auth errors and retry patterns
- [ ] Keep `@logto/react` and `@ouim/logto-authkit` up to date
- [ ] Review Logto tenant security settings regularly

---

## See Also

- [SECURITY.md](../SECURITY.md) — Vulnerability disclosure policy
- [CONTRIBUTING.md](../CONTRIBUTING.md) — Security-related contribution guidelines
- [src/server/csrf.ts](../src/server/csrf.ts) — CSRF implementation details
