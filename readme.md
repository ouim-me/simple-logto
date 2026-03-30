# @ouim/simple-logto

`@ouim/simple-logto` is a batteries-included auth toolkit for Logto-powered React apps.

It wraps `@logto/react` with the pieces most teams end up building anyway:

- a higher-level React provider and hook
- ready-made sign-in, callback, and account UI
- backend token verification for Node and Next.js
- bundler fixes for the `jose` edge cases that usually slow setup down

If you want Logto without re-assembling the same frontend and backend auth plumbing from scratch, this package is the opinionated fast path.

## What It Actually Ships

### Frontend

- `AuthProvider` for wiring Logto into your app with less boilerplate
- `useAuth` for user state, auth actions, and route protection patterns
- `UserCenter` for a production-ready account dropdown
- `CallbackPage` for redirect and popup callback handling
- `SignInPage` for dedicated `/signin` routes
- `SignInButton` for drop-in sign-in triggers
- popup sign-in support
- guest mode support
- custom navigation support for SPA routers

### Backend

- JWT verification against Logto JWKS
- Express middleware via `createExpressAuthMiddleware`
- Next.js request verification via `verifyNextAuth`
- generic `verifyAuth` helper for custom servers and handlers
- optional scope checks
- cookie and bearer-token extraction
- guest-aware auth context support

### Build tooling

- Vite config helpers
- Webpack config helpers
- Next.js config helpers
- a dedicated `bundler-config` entrypoint for build-time imports

## Why We Use It

- Faster first integration: frontend and backend auth can be wired from one package.
- Better defaults: common auth screens and account UI are already handled.
- Less glue code: cookie syncing, callback handling, popup flows, and request verification are built in.
- Easier adoption: you still keep Logto underneath, so you are not boxed into a custom auth system.

## Installation

```bash
npm install @ouim/simple-logto @logto/react
```

Peer dependencies:

- `react`
- `react-dom`
- `@logto/react`

## Runtime Support

The package currently declares compatibility with:

- Node.js `18.18+`, `20.x`, `22.x`, and `24.x`
- React `17.x`, `18.x`, and `19.x`
- `@logto/react` `3.x` and `4.x`

GitHub Actions runs the default validation gate on Node `24`, which is the current Active LTS line as of March 29, 2026. The published `engines` field expresses the broader compatibility policy, while CI stays intentionally lighter for day-to-day pull requests.

## Examples

- [example_app/README.md](./example_app/README.md) contains the Vite React playground plus an Express backend-verification sample under [example_app/server/README.md](./example_app/server/README.md).
- [examples/nextjs-app-router/README.md](./examples/nextjs-app-router/README.md) shows a small Next.js App Router integration with `AuthProvider`, callback/sign-in routes, and `verifyNextAuth`.

## Quick Start

### 1. Wrap your app

```tsx
import { AuthProvider } from '@ouim/simple-logto'

const logtoConfig = {
  endpoint: 'https://your-tenant.logto.app',
  appId: 'your-app-id',
  resources: ['https://your-api.example.com'],
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider config={logtoConfig} callbackUrl="http://localhost:3000/callback">
      {children}
    </AuthProvider>
  )
}
```

### 2. Add the callback route

```tsx
import { CallbackPage } from '@ouim/simple-logto'

export default function CallbackRoute() {
  return <CallbackPage />
}
```

### 3. Add a sign-in entry point

```tsx
import { SignInPage } from '@ouim/simple-logto'

export default function SignInRoute() {
  return <SignInPage />
}
```

### 4. Use auth anywhere

```tsx
import { useAuth } from '@ouim/simple-logto'

export function Dashboard() {
  const { user, isLoadingUser, signIn, signOut } = useAuth()

  if (isLoadingUser) return <div>Loading...</div>
  if (!user) return <button onClick={() => signIn()}>Sign in</button>

  return (
    <div>
      <p>Welcome, {user.name ?? user.id}</p>
      <button onClick={() => signOut()}>Sign out</button>
    </div>
  )
}
```

### 5. Add account UI

```tsx
import { UserCenter } from '@ouim/simple-logto'

export function Navbar() {
  return (
    <nav className="flex items-center justify-between h-16 px-4 border-b">
      <div className="font-bold">MyApp</div>
      <UserCenter />
    </nav>
  )
}
```

![UserCenter](image.png)

![UserCenter logged in](image-1.png)

## Frontend API

### `AuthProvider`

Main provider for the package. It wraps Logto, manages auth refresh, and keeps the browser cookie in sync for backend verification.

Props:

- `config`: Logto config object
- `callbackUrl?`: default auth callback URL
- `customNavigate?`: custom navigation function for React Router, Next.js, or other SPA routers
- `enablePopupSignIn?`: enables popup-based sign-in flow
- `onTokenRefresh?`: called when an already-authenticated session receives a different access token
- `onAuthError?`: called when auth loading hits a transient or definitive auth error
- `onSignOut?`: called immediately before the provider initiates local or global sign-out

Example with custom router navigation:

```tsx
<AuthProvider config={logtoConfig} callbackUrl="/callback" customNavigate={url => router.push(url)} enablePopupSignIn>
  <App />
</AuthProvider>
```

Lifecycle callback example:

```tsx
<AuthProvider
  config={logtoConfig}
  onTokenRefresh={({ expiresAt }) => analytics.track('token_refreshed', { expiresAt })}
  onAuthError={({ error, isTransient }) => console.error('auth error', { message: error.message, isTransient })}
  onSignOut={({ reason }) => analytics.track('signed_out', { reason })}
>
  <App />
</AuthProvider>
```

### `useAuth`

Returns:

- `user`
- `isLoadingUser`
- `signIn`
- `signOut`
- `refreshAuth`
- `enablePopupSignIn`

You can also use it for lightweight route protection:

```tsx
const { user } = useAuth({
  middleware: 'auth',
  redirectTo: '/signin',
})
```

Guest-only route example:

```tsx
const auth = useAuth({
  middleware: 'guest',
  redirectIfAuthenticated: '/dashboard',
})
```

### `usePermission`

Use `usePermission()` for client-side conditional rendering when the current frontend user claims already include permission data.

```tsx
import { usePermission } from '@ouim/simple-logto'

function AdminActions() {
  const canManageUsers = usePermission('manage:users')

  if (!canManageUsers) {
    return null
  }

  return <button>Invite user</button>
}
```

Notes:

- `usePermission()` reads the `user` object from `AuthProvider`, so it reflects frontend claims only.
- By default it checks `permissions`, then `scope`, then `scp`.
- Pass `claimKeys` if your tenant emits permissions under a custom claim name such as `https://example.com/permissions`.
- While auth state is loading the hook returns `false` so restricted UI does not flash before claims arrive.

### `UserCenter`

Prebuilt account dropdown for navbars and app shells.

Supports:

- signed-in and signed-out states
- local sign-out by default, or global sign-out when explicitly enabled
- custom account links
- custom theme class names

```tsx
<UserCenter
  signoutCallbackUrl="/"
  globalSignOut={false}
  additionalPages={[
    { link: '/settings', text: 'Settings' },
    { link: '/billing', text: 'Billing' },
  ]}
/>
```

Pass `globalSignOut={true}` only when you explicitly want the account menu to end the user's wider Logto tenant session, not just the current app session.

### `CallbackPage`

Drop this onto your callback route to complete the Logto auth flow.

Optional props:

- `onSuccess`
- `onError`
- `loadingComponent`
- `successComponent`
- `className`

### `SignInPage`

Use this when you want a dedicated `/signin` route that automatically initiates the auth flow. It also supports popup-based sign-in windows.

If you enable popup sign-in on `AuthProvider`, you should still define a real `/signin` route that renders `SignInPage`. The popup window navigates to that route first, and `SignInPage` is what kicks off the Logto flow inside the popup.

Optional props:

- `loadingComponent`
- `errorComponent`
- `className`

```tsx
<SignInPage
  className="min-h-screen bg-slate-50"
  loadingComponent={<div>Redirecting to Logto...</div>}
  errorComponent={error => <div>Could not start sign-in: {error.message}</div>}
/>
```

### `SignInButton`

For cases where you want a reusable trigger instead of manually calling `signIn()`.

```tsx
import { SignInButton } from '@ouim/simple-logto'

;<SignInButton />
```

## SSR And Router Boundaries

The frontend entrypoint is intentionally browser-oriented. `AuthProvider`, `useAuth`, `SignInPage`, `CallbackPage`, and `UserCenter` all rely on client-only behaviors such as cookies, `window`, popup messaging, focus events, or browser navigation.

Use these rules when integrating into SSR-capable apps:

- Render frontend auth components only from client components.
- Keep `/signin` and `/callback` as real browser routes, not server-only handlers.
- Expect the initial server render to be unauthenticated until the client hydrates and loads the Logto session.
- Do not treat server-rendered auth state from the frontend package as authoritative for backend access control; use the backend verifier helpers for that.

### React Router

Wrap the router tree in `AuthProvider` and pass a router-aware `customNavigate` callback so auth redirects stay inside the SPA router.

```tsx
'use client'

import { AuthProvider, CallbackPage, SignInPage } from '@ouim/simple-logto'
import { BrowserRouter, Route, Routes, useNavigate } from 'react-router-dom'

function AuthShell() {
  const navigate = useNavigate()

  return (
    <AuthProvider
      config={logtoConfig}
      callbackUrl={`${window.location.origin}/callback`}
      customNavigate={url => navigate(url)}
      enablePopupSignIn
    >
      <Routes>
        <Route path="/signin" element={<SignInPage />} />
        <Route path="/callback" element={<CallbackPage />} />
        <Route path="/" element={<Dashboard />} />
      </Routes>
    </AuthProvider>
  )
}

export function App() {
  return (
    <BrowserRouter>
      <AuthShell />
    </BrowserRouter>
  )
}
```

### Next.js App Router

Keep the auth UI behind client components and let the backend subpath handle server-side request verification.

```tsx
// app/providers.tsx
'use client'

import { AuthProvider } from '@ouim/simple-logto'
import { useRouter } from 'next/navigation'

export function Providers({ children }: { children: React.ReactNode }) {
  const router = useRouter()

  return (
    <AuthProvider
      config={logtoConfig}
      callbackUrl={`${process.env.NEXT_PUBLIC_APP_URL}/callback`}
      customNavigate={url => router.push(url)}
    >
      {children}
    </AuthProvider>
  )
}
```

```tsx
// app/signin/page.tsx
'use client'

import { SignInPage } from '@ouim/simple-logto'

export default function SignIn() {
  return <SignInPage />
}
```

```tsx
// app/callback/page.tsx
'use client'

import { CallbackPage } from '@ouim/simple-logto'

export default function Callback() {
  return <CallbackPage />
}
```

For protected server routes, route handlers, or middleware, import from `@ouim/simple-logto/backend` instead of trying to read frontend auth state during SSR.

These React Router and Next.js examples are mirrored by packed smoke fixtures in `smoke-fixtures/` so CI catches export or packaging drift against the documented integration patterns.

## Backend API

Import backend helpers from the dedicated subpath:

```ts
import { createExpressAuthMiddleware, hasScopes, requireScopes, verifyAuth, verifyNextAuth } from '@ouim/simple-logto/backend'
```

### Express middleware

`createExpressAuthMiddleware` automatically parses cookies for you, so you do not need to add `cookie-parser` yourself.

```ts
import express from 'express'
import { createExpressAuthMiddleware } from '@ouim/simple-logto/backend'

const app = express()

const authMiddleware = createExpressAuthMiddleware({
  logtoUrl: 'https://your-tenant.logto.app',
  audience: 'https://your-api.example.com',
  cookieName: 'logto_authtoken',
  requiredScope: 'read:profile',
  allowGuest: true,
})

app.get('/api/me', authMiddleware, (req, res) => {
  res.json({
    userId: req.auth?.userId,
    isAuthenticated: req.auth?.isAuthenticated,
    isGuest: req.auth?.isGuest,
  })
})
```

### Next.js route handlers

```ts
import { verifyNextAuth } from '@ouim/simple-logto/backend'

export async function GET(request: Request) {
  const result = await verifyNextAuth(request, {
    logtoUrl: process.env.LOGTO_URL!,
    audience: process.env.LOGTO_AUDIENCE!,
    allowGuest: false,
  })

  if (!result.success) {
    return Response.json({ error: result.error }, { status: 401 })
  }

  return Response.json({
    userId: result.auth.userId,
    payload: result.auth.payload,
  })
}
```

### SSR-safe backend verification pattern

For SSR frameworks, make authorization decisions on the server with the backend subpath and pass only the derived result to your rendered UI.

```ts
import { verifyAuth } from '@ouim/simple-logto/backend'

export async function loadUserFromRequest(request: Request) {
  const auth = await verifyAuth(request, {
    logtoUrl: process.env.LOGTO_URL!,
    audience: process.env.LOGTO_AUDIENCE!,
    allowGuest: true,
  })

  return {
    userId: auth.userId,
    isAuthenticated: auth.isAuthenticated,
    isGuest: auth.isGuest,
  }
}
```

### Generic token verification

```ts
import { verifyAuth } from '@ouim/simple-logto/backend'

const auth = await verifyAuth('your-jwt-token', {
  logtoUrl: 'https://your-tenant.logto.app',
  audience: 'https://your-api.example.com',
})
```

### Backend options

- `logtoUrl`: required
- `audience`: required for protected API resources, accepts either a single audience string or an array of allowed audiences
- `cookieName?`: defaults to `logto_authtoken`
- `requiredScope?`: rejects requests missing the given scope
- `allowGuest?`: enables guest auth fallback
- `jwksCacheTtlMs?`: overrides the default 5 minute in-memory JWKS cache TTL
- `skipJwksCache?`: bypasses the in-memory JWKS cache for a single verifier/middleware instance

### Multi-scope and role authorization helpers

If you need more than the built-in single `requiredScope` check, use the backend authorization helpers after token verification:

```ts
import { hasRole, hasScopes, requireRole, requireScopes, verifyAuth } from '@ouim/simple-logto/backend'

const auth = await verifyAuth(request, {
  logtoUrl: process.env.LOGTO_URL!,
  audience: process.env.LOGTO_AUDIENCE!,
})

if (!hasScopes(auth, ['profile:read', 'profile:write'], { mode: 'any' })) {
  return Response.json({ error: 'Forbidden' }, { status: 403 })
}

requireScopes(auth, ['profile:read', 'profile:write'])

if (!hasRole(auth, 'admin')) {
  return Response.json({ error: 'Forbidden' }, { status: 403 })
}

requireRole(auth, 'admin')
```

Notes:

- `hasScopes(subject, scopes, { mode })` returns a boolean for either a raw `AuthPayload` or a full `AuthContext`.
- `requireScopes(subject, scopes, { mode })` throws an error you can map to `403`.
- `mode: 'all'` is the default; use `mode: 'any'` when any one of the scopes should be enough.
- Scope parsing follows the OAuth `scope` claim convention: a whitespace-delimited string.
- `hasRole(subject, role, { claimKeys })` and `requireRole(subject, role, { claimKeys })` check role claims without coupling the logic to Express or Next.js.
- Role helpers look for `roles` first and then `role` by default. If your Logto tenant maps roles into a custom claim, pass `claimKeys`, for example `['https://example.com/roles']`.

### JWKS cache controls

Backend verification uses a per-process in-memory JWKS cache by default. If you need tighter control during key rotation, debugging, or unusual network setups, you can tune or clear it explicitly:

```ts
import { clearJwksCache, invalidateJwksCache, verifyAuth } from '@ouim/simple-logto/backend'

await verifyAuth(token, {
  logtoUrl: 'https://your-tenant.logto.app',
  audience: 'https://your-api.example.com',
  jwksCacheTtlMs: 60_000,
})

invalidateJwksCache('https://your-tenant.logto.app')
clearJwksCache()
```

### Auth context shape

```ts
interface AuthContext {
  userId: string | null
  isAuthenticated: boolean
  payload: AuthPayload | null
  isGuest?: boolean
  guestId?: string
}
```

## Bundler Config

This package includes bundler helpers for the `jose` resolution issues that often show up during Logto integration.

For build-time scripts, prefer the dedicated subpath:

```ts
import { viteConfig, getBundlerConfig } from '@ouim/simple-logto/bundler-config'
```

### Vite

```ts
import { defineConfig } from 'vite'
import { viteConfig } from '@ouim/simple-logto/bundler-config'

export default defineConfig({
  ...viteConfig,
})
```

### Webpack

```ts
import { webpackConfig } from '@ouim/simple-logto/bundler-config'

export default {
  ...webpackConfig,
}
```

### Next.js

```ts
import { nextjsConfig } from '@ouim/simple-logto/bundler-config'

const nextConfig = {
  ...nextjsConfig,
}

export default nextConfig
```

## TypeScript

The package ships typed frontend and backend exports.

```ts
import type {
  LogtoUser,
  AuthOptions,
  AuthContextType,
  AuthProviderProps,
  CallbackPageProps,
  SignInPageProps,
  AdditionalPage,
  SignInButtonProps,
} from '@ouim/simple-logto'

import type {
  AuthContext,
  AuthPayload,
  AuthorizationMode,
  VerifyAuthOptions,
  ExpressRequest,
  ExpressResponse,
  ExpressNext,
  NextRequest,
  NextResponse,
} from '@ouim/simple-logto/backend'
```

## Positioning

`@ouim/simple-logto` is best thought of as the practical app-layer around Logto:

- Logto remains the identity platform
- `@logto/react` remains the core SDK
- this package adds the missing productized layer most app teams want on day one

If your team eventually needs lower-level control, you can still drop down to the official Logto APIs without throwing your whole auth model away.

## Repository Notes

- frontend and backend helpers are published from the same package
- backend helpers are exposed from `@ouim/simple-logto/backend`
- bundler helpers are exposed from `@ouim/simple-logto/bundler-config`

## Troubleshooting

### CORS errors on your backend API

Cause: your API is rejecting the browser origin or not allowing credentialed requests, so auth cookies or bearer-token requests never reach the server correctly.

Fix:

- Allow your frontend origin in the backend CORS config.
- If you rely on cookies, enable credentials on both sides: backend `Access-Control-Allow-Credentials: true` and frontend `fetch(..., { credentials: 'include' })`.
- Keep the frontend app, callback route, and backend cookie domain aligned. A cookie set for one host will not be sent to another.

### JWKS fetch failures

Cause: the backend cannot reach `https://<your-logto-host>/oidc/jwks`, the `logtoUrl` is wrong, or the Logto tenant URL includes a typo or wrong environment.

Fix:

- Verify `logtoUrl` is the tenant base URL, for example `https://your-tenant.logto.app`.
- Open `https://your-tenant.logto.app/oidc/jwks` directly and confirm it returns JSON.
- Check outbound network rules, proxy settings, and TLS certificates on the server running `verifyAuth` / `verifyNextAuth`.
- If failures happen only after a deployment or key rotation, retry once first: the verifier already invalidates stale JWKS cache entries and refetches keys automatically.

### "Invalid audience"

Cause: the token's `aud` claim does not include the API resource identifier you passed as `audience` in the backend verifier.

Fix:

- Make sure the frontend Logto config requests the same resource in `resources`.
- Make sure the backend `audience` matches that resource exactly.
- If your API accepts multiple resources, pass `audience` as an array to backend helpers.
- Decode a failing token and compare its `aud` claim with your configured `audience` value instead of assuming they match.

### Popup sign-in is blocked

Cause: the browser blocked `window.open`, usually because the sign-in call was not triggered from a direct user interaction or the site is in a stricter popup policy context.

Fix:

- Trigger popup sign-in from a real click or tap handler.
- Keep a real `/signin` route that renders `SignInPage`; popup flow depends on it.
- If popup restrictions are unavoidable, disable popup flow and use the default redirect flow instead.
- Test with browser extensions disabled if a popup blocker is interfering during development.

### Infinite redirect loop

Cause: the app is repeatedly sending unauthenticated users to sign-in without successfully finishing the callback or persisting the token.

Fix:

- Confirm both `/signin` and `/callback` routes exist and render `SignInPage` and `CallbackPage`.
- Ensure `callbackUrl` in `AuthProvider` exactly matches the redirect URI configured in Logto.
- Do not protect the callback route itself with `useAuth({ middleware: 'auth' })`.
- If you use custom navigation, verify it does not rewrite the callback URL or strip query parameters before `CallbackPage` runs.
- Check whether auth cookies are being cleared or blocked after callback, especially across different domains, subdomains, or HTTP/non-HTTPS environments.

## License

MIT
