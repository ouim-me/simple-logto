# AGENTS.md

This file is the working map for humans and AI agents contributing to `@ouim/logto-authkit`.

It should help you answer four questions quickly:

1. What does this package ship?
2. Where does a behavior live?
3. What can safely be changed without breaking consumers?
4. What must be tested before shipping?

## Project Snapshot

- Package name: `@ouim/logto-authkit`
- Repo type: single-package TypeScript library
- Primary domain: Logto authentication for React frontends plus Node/Next backend verification
- Current published entrypoints:
  - `@ouim/logto-authkit`
  - `@ouim/logto-authkit/server`
  - `@ouim/logto-authkit/server/session`
  - `@ouim/logto-authkit/account`
  - `@ouim/logto-authkit/organization`
  - `@ouim/logto-authkit/styles.css`
  - `@ouim/logto-authkit/bundler-config`
- Build output: `dist/` only
- Source of truth for public exports:
  - frontend: [src/index.ts](G:\logto-authkit\src\index.ts)
  - backend: [src/server/index.ts](G:\logto-authkit\src\server\index.ts)
  - bundler helpers: [src/bundler-config.ts](G:\logto-authkit\src\bundler-config.ts)

## Commands

```bash
npm install
npm run dev
npm run build
npm run clean
npm test
npx vitest run
npx vitest run src/useAuth.test.tsx
npm run test:coverage
npm run test:size
npm run test:package
npm run test:smoke
npm run lint
npm run lint:fix
```

Before every push, run the full local gate:

```bash
npm run lint && npx tsc --project tsconfig.build.json --noEmit && npx vitest run && npm run build && npm run test:size && npm run test:package && npm run test:smoke
```

Important CI note:

- GitHub Actions uses `npm install`, not `npm ci`, because the lockfile is generated on Windows and `npm ci` can fail on Linux when optional platform binaries differ.

## Repository Shape

### Root files that matter

- [package.json](G:\logto-authkit\package.json): exports map, scripts, dependency boundaries, Node/React peer support
- [README.md](G:\logto-authkit\README.md): consumer-facing contract and examples
- [CONTRIBUTING.md](G:\logto-authkit\CONTRIBUTING.md): branch/release workflow
- [CHANGELOG.md](G:\logto-authkit\CHANGELOG.md): version history
- [vite.config.js](G:\logto-authkit\vite.config.js): library build config
- [vitest.config.ts](G:\logto-authkit\vitest.config.ts): test environment config
- [tsconfig.json](G:\logto-authkit\tsconfig.json) and [tsconfig.build.json](G:\logto-authkit\tsconfig.build.json): compiler constraints

### Main directories

- [src/](G:\logto-authkit\src): library source
- [src/server/](G:\logto-authkit\src\server): backend-only verification and auth helpers
- [scripts/](G:\logto-authkit\scripts): package audit, bundle-size, and packed smoke-test runners
- [example_app/](G:\logto-authkit\example_app): local Vite + Express example playground
- [examples/nextjs-app-router/](G:\logto-authkit\examples\nextjs-app-router): App Router integration example
- [smoke-fixtures/](G:\logto-authkit\smoke-fixtures): consumer fixtures that validate packed tarballs
- [docs/](G:\logto-authkit\docs): long-form guides, migration notes, security notes, release docs
- [.github/workflows/](G:\logto-authkit\.github\workflows): CI and publish automation

## Public API Map

### Frontend entrypoint: `@ouim/logto-authkit`

Defined by [src/index.ts](G:\logto-authkit\src\index.ts). Current public surface includes:

- `AuthProvider`
- `useAuth`
- `usePermission`
- `UserCenter`
- `CallbackPage`
- `SignInPage`
- `SignInButton`
- `SignInDialog`, `SignedIn`, `SignedOut`, `AuthLoading`, `AuthError`, `Protect`
- `useUser`, `useSession`
- `getBundlerConfig`, `viteConfig`, `webpackConfig`, `nextjsConfig`
- `cookieUtils`, `jwtCookieUtils`, `validateLogtoConfig`
- frontend types from [src/types.ts](G:\logto-authkit\src\types.ts)
- `UserScope` re-exported from `@logto/react`

Rule:

- Any new frontend export must be re-exported from [src/index.ts](G:\logto-authkit\src\index.ts), documented in [README.md](G:\logto-authkit\README.md), and covered by tests.

### Backend entrypoint: `@ouim/logto-authkit/server`

Defined by [src/server/index.ts](G:\logto-authkit\src\server\index.ts). Current public surface includes:

- token verification helpers from [src/server/verify-auth.ts](G:\logto-authkit\src\server\verify-auth.ts)
- CSRF helpers from [src/server/csrf.ts](G:\logto-authkit\src\server\csrf.ts)
- authorization helpers from [src/server/authorization.ts](G:\logto-authkit\src\server\authorization.ts)
- backend types from [src/server/types.ts](G:\logto-authkit\src\server\types.ts)

### Bundler helper entrypoint: `@ouim/logto-authkit/bundler-config`

- Backed by [src/bundler-config.ts](G:\logto-authkit\src\bundler-config.ts)
- Exists so consumers can import build-time config without pulling from the browser-oriented main entry

### Optional feature entrypoints

- `@ouim/logto-authkit/account`: direct Account API client and reusable account-center UI
- `@ouim/logto-authkit/organization`: adapter-driven organization state and UI; no default portal dependency
- `@ouim/logto-authkit/server/session`: encrypted server-only application sessions and key rotation
- `@ouim/logto-authkit/styles.css`: styles for the optional visual primitives

## Frontend Architecture

### Provider and auth state

- [src/context.tsx](G:\logto-authkit\src\context.tsx) is the center of the frontend runtime.
- `AuthProvider` wraps `LogtoProvider`, validates config, installs navigation context, and hosts the internal auth state machine.
- The provider keeps a simplified `user` model, loading state, cookie sync, popup auth recovery, refresh scheduling, transient auth retry logic, and sign-out behavior.

### What `AuthProvider` actually owns

- client-only mounting guard to avoid SSR/hydration problems
- config validation with developer warnings in non-production builds
- access-token retrieval from Logto
- writing/removing the browser JWT cookie used by backend verification
- proactive token refresh before expiry
- lifecycle callbacks:
  - `onTokenRefresh`
  - `onAuthError`
  - `onSignOut`
- distinction between:
  - global sign-out: calls Logto sign-out
  - local sign-out: clears local app session while preserving wider tenant session

### Popup sign-in flow

The popup flow spans three files and is easy to break if you only change one:

- [src/context.tsx](G:\logto-authkit\src\context.tsx): opens popup, listens for `postMessage`, storage fallback, popup-close fallback, and forces parent auth rehydration
- [src/signin.tsx](G:\logto-authkit\src\signin.tsx): popup route that initiates sign-in without recursively opening another popup
- [src/callback.tsx](G:\logto-authkit\src\callback.tsx): completes Logto callback, notifies opener, falls back to `localStorage`, then closes popup

Flow shape:

- parent window opens `/signin?popup=true`
- popup sets session flag so popup mode survives cross-origin navigation
- popup completes Logto redirect on `/callback`
- callback page notifies parent
- parent delays briefly, then force-refreshes auth state so shared storage is re-read

If you change popup timing, callback redirects, storage keys, or opener messaging, re-run:

- [src/context.test.tsx](G:\logto-authkit\src\context.test.tsx)
- [src/signin.test.tsx](G:\logto-authkit\src\signin.test.tsx)
- [src/callback.test.tsx](G:\logto-authkit\src\callback.test.tsx)

### Route protection and navigation

- [src/useAuth.ts](G:\logto-authkit\src\useAuth.ts): public hook that exposes auth state and optional lightweight route middleware
- [src/navigation.tsx](G:\logto-authkit\src\navigation.tsx): scoped navigation provider for router integration
- [src/utils.ts](G:\logto-authkit\src\utils.ts): fallback browser navigation using History API or `window.location`

Important behavior:

- `useAuth({ middleware: 'auth' })` redirects unauthenticated users
- `useAuth({ middleware: 'guest' })` redirects authenticated users away from guest-only pages
- `customNavigate` is how React Router or Next client navigation is injected into the provider

### Frontend authorization

- [src/usePermission.ts](G:\logto-authkit\src\usePermission.ts) is only for client-side conditional rendering
- it reads claims from the frontend `user` object
- it is not authoritative server access control

Default frontend permission claim lookup order:

- `permissions`
- `scope`
- `scp`

### UI entrypoints

- [src/user-center.tsx](G:\logto-authkit\src\user-center.tsx): account dropdown, sign-in trigger, sign-out trigger, additional links
- [src/signin.tsx](G:\logto-authkit\src\signin.tsx): dedicated `/signin` page component
- [src/callback.tsx](G:\logto-authkit\src\callback.tsx): dedicated `/callback` page component
- [src/components/signin-button.tsx](G:\logto-authkit\src\components\signin-button.tsx): reusable sign-in button wrapper
- [src/components/ui/](G:\logto-authkit\src\components\ui): Radix-based primitive components used by shipped UI
- [src/styles/globals.css](G:\logto-authkit\src\styles\globals.css): package-owned styles

## Backend Architecture

### Verification core

- [src/server/verify-auth.ts](G:\logto-authkit\src\server\verify-auth.ts) is the core backend module.
- It performs:
  - token extraction
  - JWKS fetching and caching
  - JWT signature verification with `jose`
  - issuer, audience, time, and scope checks
  - key-rotation retry logic
  - guest fallback support

Token lookup order:

1. auth cookie, default `logto_authtoken`
2. `Authorization: Bearer ...`

Guest lookup:

- guest cookie, default `guest_logto_authtoken`

### Runtime-specific helpers

- `verifyAuth`: generic token or request verification
- `verifyNextAuth`: Next request-style helper
- `createExpressAuthMiddleware`: Express middleware that auto-parses cookies
- `buildAuthCookieHeader`: emits an `HttpOnly` cookie header so deployments can upgrade away from JS-readable auth cookies
- `invalidateJwksCache` and `clearJwksCache`: operational cache controls

### Authorization helpers

- [src/server/authorization.ts](G:\logto-authkit\src\server\authorization.ts)
- helpers:
  - `hasScopes`
  - `requireScopes`
  - `hasRole`
  - `requireRole`

Important distinctions:

- `requiredScope` / `requiredScopes` in verification options perform auth-time checks
- authorization helpers are for post-verification application logic

Default backend role claim lookup order:

- `roles`
- `role`

### CSRF helpers

- [src/server/csrf.ts](G:\logto-authkit\src\server\csrf.ts)
- implements double-submit cookie protection
- exports:
  - `generateCsrfToken`
  - `buildCsrfCookieHeader`
  - `createCsrfMiddleware`
  - `verifyCsrfToken`

This matters because the package is not only an auth verifier now; it also provides security helpers that docs and agents should not overlook.

### Backend types

- [src/server/types.ts](G:\logto-authkit\src\server\types.ts)
- contains the canonical `AuthContext`, `AuthPayload`, `VerifyAuthOptions`, and request-like interfaces used across backend helpers and tests

## Security Model And Important Tradeoffs

### Browser cookie reality

- Frontend token sync uses JS-set cookies through `jwtCookieUtils` in [src/utils.ts](G:\logto-authkit\src\utils.ts).
- Because those cookies are set in the browser, they cannot be `HttpOnly`.
- This is convenient for frontend-driven callback flows, but it is not the highest-security deployment shape.

Preferred secure deployment pattern:

- let the frontend finish auth
- send the JWT to a backend endpoint
- verify it server-side
- re-set it using `buildAuthCookieHeader()` as `HttpOnly`

### Guest mode

- Guest mode exists on both frontend and backend paths.
- Frontend guest identity is created with fingerprint-first logic in [src/utils.ts](G:\logto-authkit\src\utils.ts).
- Backend helpers can return guest auth contexts when `allowGuest` is enabled.

### SSR boundary

Do not blur the client/server split:

- browser-only auth UI belongs in `@ouim/logto-authkit`
- authoritative server auth belongs in `@ouim/logto-authkit/server`

For SSR-capable apps:

- render frontend auth components from client components only
- treat backend verification as the source of truth for protected data and actions

## File Map: Where To Look

### If you need to change sign-in or sign-out behavior

- [src/context.tsx](G:\logto-authkit\src\context.tsx)
- [src/signin.tsx](G:\logto-authkit\src\signin.tsx)
- [src/callback.tsx](G:\logto-authkit\src\callback.tsx)
- [src/user-center.tsx](G:\logto-authkit\src\user-center.tsx)
- [src/components/signin-button.tsx](G:\logto-authkit\src\components\signin-button.tsx)

### If you need to change route protection or router integration

- [src/useAuth.ts](G:\logto-authkit\src\useAuth.ts)
- [src/navigation.tsx](G:\logto-authkit\src\navigation.tsx)
- [src/utils.ts](G:\logto-authkit\src\utils.ts)

### If you need to change cookies, token persistence, guest IDs, or config validation

- [src/utils.ts](G:\logto-authkit\src\utils.ts)
- [src/types.ts](G:\logto-authkit\src\types.ts)

### If you need to change JWT verification, scopes, roles, or guest backend behavior

- [src/server/verify-auth.ts](G:\logto-authkit\src\server\verify-auth.ts)
- [src/server/authorization.ts](G:\logto-authkit\src\server\authorization.ts)
- [src/server/types.ts](G:\logto-authkit\src\server\types.ts)

### If you need to change CSRF behavior

- [src/server/csrf.ts](G:\logto-authkit\src\server\csrf.ts)
- [src/server/authorization.test.ts](G:\logto-authkit\src\server\authorization.test.ts)
- [src/server/middleware.test.ts](G:\logto-authkit\src\server\middleware.test.ts)

### If you need to change public package exports or packaging

- [package.json](G:\logto-authkit\package.json)
- [src/index.ts](G:\logto-authkit\src\index.ts)
- [src/server/index.ts](G:\logto-authkit\src\server\index.ts)
- [src/bundler-config.ts](G:\logto-authkit\src\bundler-config.ts)
- [scripts/run-package-audit.mjs](G:\logto-authkit\scripts\run-package-audit.mjs)
- [scripts/run-packed-smoke-tests.mjs](G:\logto-authkit\scripts\run-packed-smoke-tests.mjs)

### If you need to change the build or size constraints

- [vite.config.js](G:\logto-authkit\vite.config.js)
- [scripts/check-bundle-size.mjs](G:\logto-authkit\scripts\check-bundle-size.mjs)

## Tests And Validation Strategy

### Unit and component tests

Most source files have direct Vitest coverage in `src/*.test.tsx`, `src/*.test.ts`, or `src/server/*.test.ts`.

High-value tests include:

- [src/context.test.tsx](G:\logto-authkit\src\context.test.tsx)
- [src/useAuth.test.tsx](G:\logto-authkit\src\useAuth.test.tsx)
- [src/usePermission.test.tsx](G:\logto-authkit\src\usePermission.test.tsx)
- [src/signin.test.tsx](G:\logto-authkit\src\signin.test.tsx)
- [src/callback.test.tsx](G:\logto-authkit\src\callback.test.tsx)
- [src/server/verify-auth.test.ts](G:\logto-authkit\src\server\verify-auth.test.ts)
- [src/server/authorization.test.ts](G:\logto-authkit\src\server\authorization.test.ts)
- [src/server/middleware.test.ts](G:\logto-authkit\src\server\middleware.test.ts)
- [src/server/express.integration.test.ts](G:\logto-authkit\src\server\express.integration.test.ts)
- [src/server/next-route.integration.test.ts](G:\logto-authkit\src\server\next-route.integration.test.ts)
- [src/bundler-config.test.ts](G:\logto-authkit\src\bundler-config.test.ts)

### Smoke fixtures

Packed smoke tests matter because this is a library, not just an app. They catch export/packaging drift that unit tests miss.

Fixtures live in [smoke-fixtures/](G:\logto-authkit\smoke-fixtures):

- `vite-react`
- `react17`
- `react-router`
- `next-app-router`
- `node-backend`
- `bundler-config`

The smoke runner:

- requires an existing `dist/`
- runs `npm pack`
- installs the tarball into isolated fixture workspaces
- typechecks and/or builds each fixture

See [scripts/run-packed-smoke-tests.mjs](G:\logto-authkit\scripts\run-packed-smoke-tests.mjs).

### Package audit

The package audit verifies:

- packed tarball contains expected files for all exported entrypoints
- README only references supported public import specifiers

See [scripts/run-package-audit.mjs](G:\logto-authkit\scripts\run-package-audit.mjs).

### Bundle budgets

Bundle size is explicitly budgeted for:

- frontend ESM/CJS
- backend ESM/CJS
- bundler helper ESM/CJS

See [scripts/check-bundle-size.mjs](G:\logto-authkit\scripts\check-bundle-size.mjs).

## Examples And Consumer References

Use these when you need to understand intended integration patterns instead of just internal implementation:

- [example_app/README.md](G:\logto-authkit\example_app\README.md): Vite + React playground
- [example_app/server/README.md](G:\logto-authkit\example_app\server\README.md): Express backend example
- [examples/nextjs-app-router/README.md](G:\logto-authkit\examples\nextjs-app-router\README.md): Next App Router integration
- [src/server/README.md](G:\logto-authkit\src\server\README.md): backend API guide
- [README.md](G:\logto-authkit\README.md): consumer-facing quick start and troubleshooting

## Docs Worth Checking Before Large Changes

- [docs/SECURITY_AND_FEATURES.md](G:\logto-authkit\docs\SECURITY_AND_FEATURES.md)
- [docs/PERMISSIONS_AND_AUTHORIZATION.md](G:\logto-authkit\docs\PERMISSIONS_AND_AUTHORIZATION.md)
- [docs/MIGRATION_GUIDE.md](G:\logto-authkit\docs\MIGRATION_GUIDE.md)
- [docs/CI_CD_AND_RELEASES.md](G:\logto-authkit\docs\CI_CD_AND_RELEASES.md)
- [docs/LINKED_LOCAL_PACKAGE_TROUBLESHOOTING.md](G:\logto-authkit\docs\LINKED_LOCAL_PACKAGE_TROUBLESHOOTING.md)
- [docs/notes/](G:\logto-authkit\docs\notes): implementation notes and historical debugging context

## Current Constraints And Conventions

- TypeScript strict mode is enabled.
- Backend code must not depend on DOM APIs.
- Frontend entrypoint is intentionally browser-oriented and begins with `'use client'`.
- Public exports are controlled by `package.json#exports`; do not add or rename entrypoints casually.
- This repo ships dual ESM/CJS builds; any export change must keep both working.
- `UserCenter` defaults to local sign-out, not global sign-out.
- `verifyNextAuth(..., { allowGuest: true })` can return `success: true` for guests; check `auth.isAuthenticated` or `auth.isGuest`, not just `success`.
- Packed smoke tests and package audits are first-class release checks, not optional extras.

## Common Change Patterns

### Adding a new frontend export

1. Implement it under [src/](G:\logto-authkit\src)
2. Export it from [src/index.ts](G:\logto-authkit\src\index.ts)
3. Add or update tests
4. Update [README.md](G:\logto-authkit\README.md)
5. If it changes integration guidance, update docs and examples
6. Run the full validation gate

### Adding a new backend helper

1. Implement it under [src/server/](G:\logto-authkit\src\server)
2. Export it from [src/server/index.ts](G:\logto-authkit\src\server\index.ts)
3. Add backend tests and, if relevant, integration fixtures
4. Update [src/server/README.md](G:\logto-authkit\src\server\README.md) and [README.md](G:\logto-authkit\README.md)
5. Confirm package audit and smoke fixtures still pass

### Changing auth cookies or request verification

1. Inspect both frontend and backend cookie readers/writers
2. Check docs for security claims
3. Re-test guest mode
4. Re-test Express and Next flows
5. Re-test smoke fixtures because cookie behavior can surface indirectly in consumer setups

## Release And CI Notes

- CI workflow: [.github/workflows/ci.yml](G:\logto-authkit\.github\workflows\ci.yml)
- publish workflow: [.github/workflows/publish.yml](G:\logto-authkit\.github\workflows\publish.yml)
- CI currently validates:
  - lint
  - TypeScript no-emit typecheck
  - Vitest
  - build
  - bundle size
  - package audit
- local pre-push guidance additionally includes `npm run test:smoke`

Current CI target:

- Node 24 on `ubuntu-latest`

Declared runtime support in [package.json](G:\logto-authkit\package.json):

- Node `^18.18.0 || ^20.0.0 || ^22.0.0 || ^24.0.0`
- React `^17 || ^18 || ^19`
- `@logto/react` `^3 || ^4`

## Practical Flyover

At a high level, this package is the app-layer glue around Logto.

- The frontend side turns Logto's client SDK into an opinionated auth shell with route helpers, popup support, UI primitives, and token-to-cookie syncing for backend access.
- The backend side turns raw JWT verification into reusable request-time auth helpers for Express and Next, plus role/scope/CSRF helpers that close the gap between identity and app authorization.
- The packaging side makes sure consumers can import the right thing in browser, server, and build-tool contexts without having to know the repo internals.

That means most changes ripple across three concerns at once:

- runtime behavior
- published API surface
- packed-consumer compatibility

If you keep those three in sync, changes here tend to land cleanly.
