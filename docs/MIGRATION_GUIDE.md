# Migration Guide

This document covers changes in recent releases and how to update your code if needed.

## v1 beta — Identity feature consolidation

The v1 line keeps `@ouim/logto-authkit` as the single application-facing package. The temporary `@ouim/identity` experiment is not a dependency and should not be installed alongside AuthKit.

Existing integrations remain valid. The following APIs are additive:

```tsx
import { SignInDialog, SignedIn, SignedOut, useSession, useUser } from '@ouim/logto-authkit'
import { AccountCenter } from '@ouim/logto-authkit/account'
import { OrganizationProvider, OrganizationSwitcher } from '@ouim/logto-authkit/organization'
import '@ouim/logto-authkit/styles.css'
```

To adopt direct provider popups:

1. Keep real `/signin` and `/callback` routes using `SignInPage` and `CallbackPage`.
2. Add `signInPath`, `defaultSignInMode`, and `sessionPolicy` to `AuthProvider`.
3. Render `SignInDialog`, or call `openSignIn({ strategy, mode, returnTo })`.
4. Test local sign-out followed by sign-in, provider account choice, backend API authentication, and a hard reload.

`signIn()` and `signIn(callbackUrl, usePopup)` still use the compatible hosted flow. No portal is required for sign-in, Account API operations, or backend verification.

Organization administration and account deletion remain privileged. Configure an explicit trusted-server adapter; do not expose a Management API credential to the browser.

## v0.1.9+ (Unreleased) — Critical Fixes & Security Hardening

### Breaking Changes

#### 1. `UserCenter` Sign-Out Default (SECURITY)

**What changed:** The `UserCenter` component now defaults to **app-local sign-out** instead of tenant-wide logout.

**Before:**
```jsx
<UserCenter /> // ← Global sign-out (entire Logto tenant logged out)
```

**After:**
```jsx
<UserCenter /> // ← Local sign-out (only this app) — SAFER DEFAULT

// To opt into global tenant logout:
<UserCenter globalSignOut={true} />
```

**Why:** Signing out of just your app is much safer than signing the user out of their entire identity provider. If you genuinely need tenant-wide logout (rare), you must now be explicit about it.

**Action required if:**
- You relied on `UserCenter` signing users out of their Logto tenant
- Add `globalSignOut={true}` to `<UserCenter globalSignOut={true} />`

---

### New Features

#### 1. `usePermission` Hook

Check user permissions for conditional rendering:

```jsx
import { usePermission } from '@ouim/logto-authkit'

export function AdminFeature() {
  const isAdmin = usePermission('admin')

  if (!isAdmin) return null
  return <div>Admin only feature</div>
}
```

**Multiple permissions:**

```jsx
// Require ALL permissions
const canPublish = usePermission(['content:write', 'content:publish'])

// Require ANY permission
const canEdit = usePermission(['content:write', 'content:admin'], { mode: 'any' })
```

**Custom claim keys:**

```jsx
// If your permissions are stored under 'roles' instead of 'permissions'
const isAdmin = usePermission('admin', {
  claimKeys: ['roles', 'permissions'] // Check 'roles' first, then 'permissions'
})
```

#### 2. Backend Authorization Helpers

Check permissions server-side:

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

  // Single role check
  if (!checkRoleAuthorization(authResult.auth.payload, 'admin')) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  return Response.json({ data: 'admin-only data' })
}
```

#### 3. CSRF Protection

New `csrf.ts` module for backend route protection:

```javascript
// Express
import { createCsrfMiddleware } from '@ouim/logto-authkit/server'

const csrfMiddleware = createCsrfMiddleware()
app.use(csrfMiddleware)

app.post('/api/update-profile', (req, res) => {
  // CSRF token validated automatically
})
```

```javascript
// Next.js
import { verifyCsrfToken } from '@ouim/logto-authkit/server'

export async function POST(request) {
  const result = verifyCsrfToken(request)
  if (!result.valid) {
    return Response.json({ error: result.error }, { status: 403 })
  }
}
```

#### 4. Provider Lifecycle Callbacks

React to auth state changes:

```jsx
<AuthProvider
  config={logtoConfig}
  onTokenRefresh={({ expiresAt }) => {
    console.log('Token refreshed')
  }}
  onAuthError={({ error, isTransient }) => {
    if (isTransient) {
      // Auto-retry in progress
    } else {
      // Real auth error
    }
  }}
  onSignOut={({ reason }) => {
    console.log('Signed out:', reason)
  }}
>
  <App />
</AuthProvider>
```

#### 5. Configurable Post-Callback Redirect

Control where the app redirects after sign-in:

```jsx
<CallbackPage redirectTo="/dashboard" />
```

---

### Bug Fixes & Improvements

#### Popup Sign-In

- **Fixed:** Page reload immediately after popup completion (was discarding async state updates)
- **Fixed:** Dangling `setTimeout` in popup cleanup wasn't cleared on success
- **Fixed:** `signIn()` without try/catch could orphan popup listeners

**Impact:** Popup sign-in now completes without a full page reload and cleans up properly.

#### Auth State Recovery

- **Fixed:** Local sign-out (`signOut({ global: false })`) now prevents accidental global logout
- **Fixed:** Race condition where popup completion couldn't rehydrate auth state in parent window

**Impact:** Auth state is now stable during refresh and popup completion.

#### Guest Sessions

- **Fixed:** Guest ID was regenerated on every backend request (now stable)
- **Fixed:** `verifyNextAuth` returned `success: false` for valid guests (now returns `success: true`)

**Impact:** Guest sessions now work correctly on the backend and don't require workarounds.

#### Network Resilience

- **Fixed:** Transient network errors (timeouts, 5xx) no longer force sign-out
- **New:** Exponential backoff retry strategy (up to 5 retries, 32 second cap)

**Impact:** Brief network outages won't disrupt user sessions.

#### Payload Validation

- **Fixed:** JWT payload fields weren't validated before use
- **Improved:** Audience field now supports both `string` and `string[]` (RFC 7519)
- **Fixed:** Issuer URL construction now consistent between JWKS fetch and verification

#### Cookie Security

- **Fixed:** Guest cookies were missing `Secure` and `SameSite` flags
- **All cookies:** Now use `Secure: true`, `SameSite: Strict` consistently

---

### Security Enhancements

#### 1. JWKS Cache Invalidation

Keys that rotate are now detected automatically:

```javascript
const authMiddleware = createExpressAuthMiddleware({
  logtoUrl: 'https://your-tenant.logto.app',
  audience: 'your-api',
  // Cache now automatically refreshes on key rotation
})
```

#### 2. Backend Cookie Upgrade

Use `buildAuthCookieHeader` to set `HttpOnly` cookies on the backend:

```javascript
import { buildAuthCookieHeader, verifyNextAuth } from '@ouim/logto-authkit/server'

export async function GET(request) {
  const result = await verifyNextAuth(request, {
    logtoUrl: process.env.LOGTO_URL,
    audience: 'your-api',
  })

  if (result.success) {
    const setCookieHeader = buildAuthCookieHeader(result.auth.payload)
    response.headers.set('Set-Cookie', setCookieHeader)
  }
}
```

#### 3. postMessage Origin Verification

Popup origin checks are now stricter (blocks same-origin spoofing).

---

### Deprecations

None yet — all changes are additive or bug fixes.

---

### Migration Checklist

- [ ] Update `UserCenter` calls if you relied on global sign-out (add `globalSignOut={true}`)
- [ ] Review auth error handling — transient vs. definite failures are now distinguished
- [ ] Consider adding lifecycle callbacks (`onAuthError`, `onTokenRefresh`, `onSignOut`)
- [ ] If serving protected content, review the [SECURITY_AND_FEATURES.md](./SECURITY_AND_FEATURES.md) guide
- [ ] Update `CallbackPage` if you need custom redirect behavior
- [ ] Test popup sign-in flows (behavior changed slightly but is now more reliable)

---

## Troubleshooting

### "My popup doesn't reload the page after sign-in anymore"

This is intentional and correct! The popup completion no longer triggers `window.location.reload()`. The auth state updates automatically through React. If you have a custom flow that depends on the reload, you can trigger it manually:

```jsx
const { user, isLoadingUser } = useAuth()

useEffect(() => {
  if (user && !isLoadingUser) {
    // Optionally reload if needed for your flow
    window.location.reload()
  }
}, [user, isLoadingUser])
```

### "Local sign-out isn't working"

Make sure you're calling the correct function:

```jsx
const { signOut } = useAuth()

// Local sign-out (app only)
await signOut({ global: false })

// Tenant-wide sign-out
await signOut({ global: true })
```

### "usePermission always returns false"

Check:
1. Is the user authenticated? (`useAuth().user` should exist)
2. Are the permissions in the JWT? (check the token in browser DevTools)
3. Are you using the right claim key? (defaults: `permissions`, `scope`, `scp`)

```jsx
// Debug: print all claims
const { user } = useAuth()
console.log('User claims:', user)

// If your claims are under 'roles' instead:
const isAdmin = usePermission('admin', { claimKeys: ['roles'] })
```

---

## Questions?

See the full docs:
- [docs/SECURITY_AND_FEATURES.md](./SECURITY_AND_FEATURES.md) — Security hardening & advanced features
- [src/server/README.md](../src/server/README.md) — Backend API reference
- [CONTRIBUTING.md](../CONTRIBUTING.md) — Development & contribution guide
