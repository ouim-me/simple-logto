# @ouim/simple-logto Integration Guide

A practical reference for integrating `@ouim/simple-logto` in a Vite + React + Express project, based on the actual Hearth implementation.

## Overview

`@ouim/simple-logto` wraps the Logto OAuth/OIDC platform and exposes:

| Layer    | What it provides                                                       |
| -------- | ---------------------------------------------------------------------- |
| Frontend | `AuthProvider`, `useAuth` hook, `UserCenter` component, `CallbackPage` |
| Backend  | `createExpressAuthMiddleware` for Express route protection             |
| Build    | `viteConfig` preset for `vite.config.ts`                               |

## Installation

```bash
npm install @ouim/simple-logto
# Backend JWT verification also needs:
npm install jsonwebtoken axios
```

## Frontend Setup

## Frontend Setup

### 1. Configure Vite — `vite.config.ts`

Import from the dedicated bundler-config sub-path, **not** the root package, and spread it into your `defineConfig` return value. This sets up the necessary Vite plugins and aliases that the library needs.

```typescript
// vite.config.ts
import { viteConfig } from '@ouim/simple-logto/bundler-config';
import mix from '@ouim/vite-plugin-mix';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    ...viteConfig, // ← must be spread at the top level
    plugins: [
      react(),
      tailwindcss(),
      mix.default({ handler: './server/index.js' }) // serves Express alongside Vite
    ],
    resolve: {
      alias: { '@': path.resolve(__dirname, '.') }
    }
  };
});
```

> **Note:** `@ouim/vite-plugin-mix` proxies `/api/*` requests to your Express handler in dev and bundles the server for production. This is how the frontend talks to `server/index.js` without a separate port.

---

### 2. Wrap the app — `src/main.tsx` OR `src/index.tsx`

`AuthProvider` must wrap everything that uses `useAuth`. Place it outside your router. The `callbackUrl` must match a route the router can render.

```typescript
// src/main.tsx (or src/index.tsx)
import { AuthProvider, UserScope } from '@ouim/simple-logto'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import NiceModal from '@ebay/nice-modal-react'
import { Toaster } from 'sonner'
import App from './App.tsx'
import { Callback } from './pages/Callback.tsx'

const logtoConfig = {
  endpoint: 'https://auth.ouim.me/',
  appId: '33am08tu4e4lhmq2yg2i6',
  resources: [import.meta.env.VITE_LOGTO_AUDIENCE],  // must match backend audience
  scopes: [
    UserScope.Email,
    UserScope.Profile,
    UserScope.Identities,
    UserScope.CustomData,
  ],
}

createRoot(document.getElementById('root')!).render(
  <NiceModal.Provider>
    <AuthProvider
      config={logtoConfig}
      callbackUrl={`${window.location.origin}/callback`}
      enablePopupSignIn={false}     // redirect-based flow, no popup
    >
      <Toaster position="top-right" richColors theme="dark" />
      <BrowserRouter>
        <Routes>
          <Route path="/callback" element={<Callback />} />
          <Route path="*" element={<App />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </NiceModal.Provider>,
)
```

**`AuthProvider` props:**

| Prop                | Type    | Description                                      |
| ------------------- | ------- | ------------------------------------------------ |
| `config`            | object  | Logto connection config (see above)              |
| `callbackUrl`       | string  | Full URL Logto redirects to after login          |
| `enablePopupSignIn` | boolean | `true` = popup, `false` = redirect (recommended) |

---

### 3. Handle the OAuth callback — `src/pages/Callback.tsx`

`CallbackPage` consumes the authorization code from the URL and exchanges it for tokens. Redirect to `/` on success; surface the error otherwise.

```typescript
// src/pages/Callback.tsx
import { CallbackPage } from '@ouim/simple-logto'

export const Callback: React.FC = () => (
  <CallbackPage
    onSuccess={() => {
      window.location.href = '/'
    }}
    onError={error => {
      console.error('Authentication error:', error)
      window.location.href = '/?error=auth_failed'
    }}
  />
)
```

> **Important:** The path for this route (`/callback`) must be registered in the Logto dashboard under _Redirect URIs_ for your application.

---

### 4. Access auth state — `useAuth`

```typescript
import { useAuth } from '@ouim/simple-logto'

export default function App() {
  const { user, isLoadingUser, signIn } = useAuth()

  // Wait for Logto to rehydrate the session
  if (isLoadingUser) return <LoadingScreen />

  // Not signed in — show a login prompt
  if (!user) return <button onClick={() => signIn()}>Sign in</button>

  return <Dashboard user={user} />
}
```

`useAuth` return values used in this project:

| Value           | Type             | Description                                |
| --------------- | ---------------- | ------------------------------------------ |
| `user`          | `User \| null`   | Null while loading or when unauthenticated |
| `isLoadingUser` | `boolean`        | True during initial session restore        |
| `signIn()`      | function         | Triggers sign-in redirect                  |
| `tokenRaw`      | `string \| null` | Raw JWT for manual `Authorization` headers |

**Avoid running fetches while `isLoadingUser` is true.** The hook may briefly re-enter the loading state on window focus; gate on a stable user ID rather than re-fetching every time:

```typescript
const lastUserIdRef = React.useRef<string | null>(null);

useEffect(() => {
  if (!isLoadingUser && user) {
    if (lastUserIdRef.current !== user.id) {
      fetchTasks();
      lastUserIdRef.current = user.id;
    }
  } else if (!user) {
    lastUserIdRef.current = null;
    setTasks([]);
  }
}, [isLoadingUser, user]);
```

---

### 5. Login/logout UI — `UserCenter`

Drop `UserCenter` anywhere in the UI to get a ready-made login/logout button that uses the configured provider.

```typescript
import { UserCenter } from '@ouim/simple-logto'

// Show login button (unauthenticated state in App.tsx)
<UserCenter
  className="animate-bounce mt-1"
  themeClassnames="bg-[#171717] text-slate-200"
/>
```

---

## Backend Setup — `server/index.js`

### 1. Import from the backend sub-path

```javascript
// server/index.js
import { createExpressAuthMiddleware } from '@ouim/simple-logto/backend';
```

> Do **not** import from the root `@ouim/simple-logto` on the server — it contains browser code.

### 2. Create the middleware

```javascript
const authMiddleware = createExpressAuthMiddleware({
  logtoUrl: process.env.VITE_LOGTO_URL || 'https://auth.ouim.me/',
  audience: process.env.VITE_LOGTO_AUDIENCE || 'https://tstore.ouim.me',
  allowGuests: false // 401 when no valid token is present
});
```

`createExpressAuthMiddleware` options:

| Option        | Type    | Description                                                                                |
| ------------- | ------- | ------------------------------------------------------------------------------------------ |
| `logtoUrl`    | string  | Logto server base URL                                                                      |
| `audience`    | string  | API resource identifier — **must match `resources[0]` in frontend config**                 |
| `allowGuests` | boolean | When `true`, unauthenticated requests pass through with `req.auth.isAuthenticated = false` |

### 3. Protect routes

Apply the middleware per-route or globally. Always check `req.auth.isAuthenticated` before accessing user data:

```javascript
app.get('/api/tasks', authMiddleware, async (req, res) => {
  if (!req.auth.isAuthenticated) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const tasks = await db.collection('tasks').find({ userId: req.auth.userId }).toArray();

  res.json(tasks);
});
```

`req.auth` shape after the middleware runs:

```typescript
{
  isAuthenticated: boolean   // false when token missing/invalid
  isGuest: boolean
  userId?: string            // Logto subject claim (use as DB key)
  payload?: {
    sub: string
    primaryEmail?: string
    name?: string
    username?: string
  }
  error?: string             // Set only when verification fails
}
```

---

## Environment Variables

```env
# .env.local  (never commit this file)

# Frontend — accessed via import.meta.env
VITE_LOGTO_URL=https://auth.ouim.me/
VITE_LOGTO_AUDIENCE=https://tstore.ouim.me

# Backend — accessed via process.env
VITE_LOGTO_URL=https://auth.ouim.me/
VITE_LOGTO_AUDIENCE=https://tstore.ouim.me
MONGODB_URI=mongodb+srv://...
```

> In this project the same `VITE_LOGTO_*` names are shared between frontend and backend because `vite-plugin-mix` injects Vite's env into the server handler at build time.

---

## API Exports Quick Reference

### Frontend (`@ouim/simple-logto`)

| Export           | Kind      | Purpose                                                          |
| ---------------- | --------- | ---------------------------------------------------------------- |
| `AuthProvider`   | Component | Context provider — wrap entire app                               |
| `CallbackPage`   | Component | Handles OAuth redirect callback                                  |
| `UserCenter`     | Component | Login/logout button                                              |
| `useAuth(opts?)` | Hook      | Read user, loading state, and sign-in/out                        |
| `UserScope`      | Enum      | Scope constants (`Email`, `Profile`, `Identities`, `CustomData`) |

### Build config (`@ouim/simple-logto/bundler-config`)

| Export       | Kind   | Purpose                                 |
| ------------ | ------ | --------------------------------------- |
| `viteConfig` | object | Spread into `defineConfig` return value |

### Backend (`@ouim/simple-logto/backend`)

| Export                        | Kind     | Purpose                                              |
| ----------------------------- | -------- | ---------------------------------------------------- |
| `createExpressAuthMiddleware` | function | Returns Express middleware that populates `req.auth` |

---

## Troubleshooting

| Symptom                                           | Likely cause                    | Fix                                                                                             |
| ------------------------------------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------- |
| 401 on all API requests                           | `audience` mismatch             | Ensure `resources[0]` in frontend equals `audience` in backend                                  |
| `user` is always null                             | Missing scopes                  | Add required `UserScope.*` values to `AuthProvider` config                                      |
| Callback page redirects to 404                    | Route not registered            | Add `<Route path="/callback" element={<Callback />} />` and register the URL in Logto dashboard |
| Infinite loading state                            | Fetching inside `isLoadingUser` | Gate fetch on a stable user ID (see `lastUserIdRef` pattern above)                              |
| `Cannot find module '@ouim/simple-logto/backend'` | Wrong import on server          | Use the `/backend` sub-path only in server files                                                |

---

## Security Notes

- Store `appId` and `endpoint` as public constants — they are not secrets.
- Store `MONGODB_URI` and any service tokens in `.env.local`; never commit them.
- Always verify tokens on the server. Frontend authentication state can be spoofed.
- Only request the `UserScope` values you actually use.
- Register an explicit `callbackUrl` — never use a wildcard redirect URI in the Logto dashboard.

---

## References

- [Logto Documentation](https://docs.logto.io)
- [@ouim/simple-logto source](https://github.com/thezem/simple-logto)
- [Logto Documentation](https://docs.logto.io)
- [@ouim/simple-logto GitHub](https://github.com/thezem/simple-logto)
- [OAuth 2.0 Specification](https://tools.ietf.org/html/rfc6749)
