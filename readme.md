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

Example with custom router navigation:

```tsx
<AuthProvider config={logtoConfig} callbackUrl="/callback" customNavigate={url => router.push(url)} enablePopupSignIn>
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

### `UserCenter`

Prebuilt account dropdown for navbars and app shells.

Supports:

- signed-in and signed-out states
- local or global sign-out
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

### `SignInButton`

For cases where you want a reusable trigger instead of manually calling `signIn()`.

```tsx
import { SignInButton } from '@ouim/simple-logto'

;<SignInButton />
```

## Backend API

Import backend helpers from the dedicated subpath:

```ts
import { createExpressAuthMiddleware, verifyAuth, verifyNextAuth } from '@ouim/simple-logto/backend'
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
- `audience`: required
- `cookieName?`: defaults to `logto_authtoken`
- `requiredScope?`: rejects requests missing the given scope
- `allowGuest?`: enables guest auth fallback

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
import type { LogtoUser, AuthOptions, CallbackPageProps, AdditionalPage, SignInButtonProps } from '@ouim/simple-logto'

import type { AuthContext, AuthPayload, VerifyAuthOptions } from '@ouim/simple-logto/backend'
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

## License

MIT
