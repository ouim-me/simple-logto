# Changelog

All notable changes to `@ouim/logto-authkit` are documented here.

This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
and [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/).

---

## [Unreleased]

## [1.0.0-beta.1] — 2026-07-21

### Added
- Customizable, vendor-neutral `SignInDialog` with branding, provider ordering, appearance tokens, and controlled state
- Correlated popup flow IDs, exact opener/origin validation, safe local return paths, timeout/closed-window errors, and storage fallback
- `automatic`, `explicit`, and `reauthenticate` session policies with direct Google/GitHub sign-in
- `SignedIn`, `SignedOut`, `AuthLoading`, `AuthError`, `Protect`, `useUser`, and `useSession`
- Direct Logto Account API client and reusable `AccountCenter` from `@ouim/logto-authkit/account`
- Optional organization client/provider/switcher from `@ouim/logto-authkit/organization`
- Exact organization-context verification and authorization helpers
- Encrypted application-session helpers from `@ouim/logto-authkit/server/session`
- Public stylesheet entrypoint at `@ouim/logto-authkit/styles.css`

### Changed
- Popup completion now remounts the Logto provider only after modal interaction locks are released
- API-token synchronization is serialized and can recover a callback-issued token by verified audience
- Optional account, organization, and encrypted-session features ship as tree-shakable subpath entrypoints
- Existing string/boolean `signIn` calls and hosted Logto experience remain compatible

### Security
- Popup messages require the exact popup window, exact same origin, and random flow correlation ID
- External return URLs are rejected
- Organization helpers compare the trusted token claim instead of browser-supplied workspace state
- Privileged account and organization mutations require explicit trusted-server adapters

## [0.3.0] — 2026-03-31

### Changed
- Renamed the package from `@ouim/simple-logto` to `@ouim/logto-authkit`
- Renamed the server entrypoint from `@ouim/simple-logto/backend` to `@ouim/logto-authkit/server`
- Kept the bundler helper entrypoint as `@ouim/logto-authkit/bundler-config`
- Renamed the internal source tree from `src/backend/` to `src/server/`

### Migration
- `@ouim/simple-logto` -> `@ouim/logto-authkit`
- `@ouim/simple-logto/backend` -> `@ouim/logto-authkit/server`
- `@ouim/simple-logto/bundler-config` -> `@ouim/logto-authkit/bundler-config`
- There is no compatibility shim for `/backend`

## [0.2.1] — 2026-03-31

### Changed
- Added a migration notice for the upcoming package move from `@ouim/simple-logto` to `@ouim/logto-authkit`
- Documented that `@ouim/simple-logto/backend` will become `@ouim/logto-authkit/server`
- Confirmed `@ouim/simple-logto/bundler-config` will move to `@ouim/logto-authkit/bundler-config`
- Confirmed there will be no compatibility shim for the old `/backend` subpath

### Release Notes
- This is the final old-name line before the rename release.
- The planned follow-up release is `@ouim/logto-authkit`.
- Recommended migration mapping:
  - `@ouim/simple-logto` -> `@ouim/logto-authkit`
  - `@ouim/simple-logto/backend` -> `@ouim/logto-authkit/server`
  - `@ouim/simple-logto/bundler-config` -> `@ouim/logto-authkit/bundler-config`

### Added
- GitHub Actions CI workflow (single Node 24 job: lint → type-check → test → build)
- GitHub Actions automated npm publish workflow with provenance
- `CONTRIBUTING.md` with branch protection rules and release process

### Fixed
- Popup sign-in race condition: removed `window.location.reload()` from all popup completion paths
- Dangling `setTimeout` in popup cleanup (5-minute stale callback)
- `signIn` lacked try/catch — orphaned interval on throw
- `validateLogtoConfig` used `Object.keys` on a `string[]` array
- `verifyNextAuth` returned `success: false` for valid guest sessions
- `MAX_ERROR_COUNT` forced sign-out on transient network errors (now uses exponential backoff)
- JWT audience array support (RFC 7519 compliance)
- Inconsistent issuer URL construction between JWKS fetch and claim verification
- Unstable guest ID on backend requests (was generating a new UUID per request)
- `Math.random()` UUID fallback in backend (dead code removed)
- JWKS cache invalidation on key rotation (retry-once on signature failure)
- JWT payload fields were not validated before use after `jose` decodes them
- `postMessage` origin check did not verify `event.source === popup`
- Guest cookie used raw `document.cookie` without `Secure`/`SameSite` flags

### Security
- All cookie writes (auth + guest) now go through `cookieUtils` with `Secure: true`, `SameSite: Strict`
- Documented XSS/non-`httpOnly` cookie limitation with backend-assisted mitigation example
- Added `buildAuthCookieHeader` backend helper for `HttpOnly` cookie upgrade
- Added CSRF double-submit cookie protection helpers (`src/server/csrf.ts`)

---

## [0.1.8] — 2024-01-01

> Initial tracked release. Previous releases were internal/experimental.

### Added
- `AuthProvider` wrapping `@logto/react` with token refresh and cookie sync
- `useAuth` hook for user state, auth actions, and route-protection middleware
- `UserCenter` Radix UI-based account dropdown component
- `CallbackPage` handling both redirect and popup callback flows
- `SignInPage` and sign-in initiation helpers
- Backend JWT verification via `jose` and Logto JWKS endpoint with 5-minute cache
- `verifyAuth`, `verifyNextAuth`, `createExpressAuthMiddleware` backend exports
- Bundler config helpers (`getViteConfig`, `getWebpackConfig`, `getNextConfig`)
- Guest mode fingerprint IDs via `@fingerprintjs/fingerprintjs`
- Three published entrypoints: main, `/backend`, `/bundler-config`

### Fixed
- Moved `vitest` from `dependencies` to `devDependencies`
- Replaced stale `@ouim/better-logto-react` package name in bundler config
- React peer dependency range updated to include React 18 (`^17.0.0 || ^18.0.0 || ^19.0.0`)

---

[Unreleased]: https://github.com/ouim-me/logto-authkit/compare/v0.3.0...HEAD
[0.1.8]: https://github.com/ouim-me/logto-authkit/releases/tag/v0.1.8
[0.2.1]: https://github.com/ouim-me/logto-authkit/releases/tag/v0.2.1
[0.3.0]: https://github.com/ouim-me/logto-authkit/releases/tag/v0.3.0
