# Changelog

All notable changes to `@ouim/simple-logto` are documented here.

This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
and [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/).

---

## [Unreleased]

### Added
- GitHub Actions CI workflow (Node 18/20/22 matrix)
- GitHub Actions automated npm publish workflow with provenance
- `CONTRIBUTING.md` with branch protection rules and release process
- `commitlint` + `husky` Conventional Commits enforcement
- `buildAuthCookieHeader` backend helper for `HttpOnly` cookie upgrade
- CSRF double-submit cookie protection helpers (`src/backend/csrf.ts`)
- `redirectTo` prop on `CallbackPage`

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

---

## [0.1.8] — 2024-xx-xx

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

[Unreleased]: https://github.com/thezem/simple-logto/compare/v0.1.8...HEAD
[0.1.8]: https://github.com/thezem/simple-logto/releases/tag/v0.1.8
