# Improvement Tasks — `@ouim/simple-logto`

> Prioritized roadmap for making this library production-ready and open-source quality. Each phase is self-contained and ordered by risk/impact. Complete phases in order unless noted as independent.

---

## Priority Legend

- 🔴 **Critical** — breaks production or poses security risk
- 🟠 **High** — causes real user-facing bugs or major packaging issues
- 🟡 **Medium** — reduces reliability, developer experience, or maintainability
- 🟢 **Low** — polish, nice-to-haves, and ecosystem completeness

---

## Phase 1 — Critical Packaging & Security Fixes

> These are **blocking issues** that affect every consumer of the package today. They must be fixed before any new feature work or promotion to v1.0.

**Priority: 🔴 Critical**

- [X] **1.1 — Move `vitest` to `devDependencies`** `vitest` is currently listed under `dependencies`, causing ~50+ MB of dev tooling to be installed in every consumer's `node_modules`. Move it to `devDependencies`.
  > Removed `vitest` from `dependencies` and added it alongside `@vitest/ui` in `devDependencies`. The `@vitest/ui` sibling entry was already in devDeps, so this is now consistent.

- [X] **1.2 — Fix stale package name in `bundler-config.ts`** `getBundlerConfig()` returns a Vite `optimizeDeps.include` array containing `@ouim/better-logto-react` (the old package name). Any consumer spreading this config into their Vite config adds a non-existent package to their build. Replace with the current package name `@ouim/simple-logto` or remove entirely.
  > Replaced `@ouim/better-logto-react` with `@ouim/simple-logto` in the `optimizeDeps.include` array inside the `vite` case of `getBundlerConfig()`. The stale name was the only occurrence in the file.

- [X] **1.3 — Fix React peer dependency range to include React 18** The `peerDependencies` range is `^17.0.0 || ^19.0.0`, skipping React 18. This produces npm warnings for the majority of current React users. Update to `^17.0.0 || ^18.0.0 || ^19.0.0`.
  > Updated both `react` and `react-dom` peer dependency ranges to include `^18.0.0`. React 18 is currently the dominant version in use, so this was a significant gap causing spurious npm warnings on install.

- [X] **1.4 — Fix JWT audience array support (RFC 7519 compliance)** `verifyTokenClaims` compares `payload.aud !== audience` using strict equality. RFC 7519 allows `aud` to be a string array. If Logto issues a multi-audience token, legitimate users are rejected. Update the check to handle both `string` and `string[]` for `aud`.
  > Updated the audience check in `verifyTokenClaims` to use `Array.isArray(aud) ? aud.includes(audience) : aud === audience`. Also added explicit `aud?: string | string[]` (and other standard JWT claims) to the `AuthPayload` interface in `types.ts` for proper typing.

- [X] **1.5 — Fix inconsistent issuer construction in `verifyTokenClaims`** The JWKS fetch uses string concatenation (`${normalizedLogtoUrl}/oidc/jwks`) while issuer verification uses `new URL('oidc', logtoUrl)`. These produce different results when `logtoUrl` has a path suffix. Unify both to use the same URL construction strategy.
  > Replaced `new URL('oidc', logtoUrl).toString()` with `\`${normalizedLogtoUrl}/oidc\`` in `verifyTokenClaims`, mirroring the same strip-trailing-slash + append pattern used by `fetchJWKS`. The `new URL` relative resolution would silently replace the last path segment when `logtoUrl` contained a path (e.g. `https://host/tenant` → `https://host/oidc` instead of `https://host/tenant/oidc`).

- [X] **1.6 — Fix unstable guest ID on backend requests** `extractGuestTokenFromCookies` generates a new random UUID each time no guest cookie is present, making the guest identity non-persistent per request. This defeats the purpose of guest tracking. Return `null` (or a sentinel) when no cookie is found rather than generating a new ID.
  > Replaced all three `generateUUID()` fallbacks in `extractGuestTokenFromCookies` with `null`. Guest identity is established on the frontend (which sets the persistent `guest_logto_authtoken` cookie); the backend should only read it. When no cookie exists `guestId` resolves to `undefined` in the auth context, which is the correct "no guest identity yet" signal to callers.

---

## Phase 2 — Bug Fixes: Auth Flow Correctness

> Fixes real behavioral bugs in the authentication flows that would affect end users in production.

**Priority: 🟠 High**

- [x] **2.1 — Fix popup sign-in race condition and unnecessary reload** `context.tsx` calls `loadUserRef.current(true)` then immediately `window.location.reload()`, discarding all async work. The reload is a blunt workaround for Logto SDK sync issues. Replace with a proper state update after `handleSignInCallback` resolves, or add a short delay only if the SDK truly requires it. Document the reason if a reload is truly unavoidable.
  > Removed `window.location.reload()` from all three popup-completion paths (postMessage handler, localStorage fallback handler, and popup-closed poll handler). All three were calling `loadUserRef.current(true)` and `window.location.reload()` on the same synchronous tick; the reload navigated away and killed the in-flight async state update, making the `loadUserRef` call dead code. The `POPUP_AUTH_EVENT_DELAY` (500 ms) is sufficient for Logto's React SDK to sync from shared localStorage before `loadUserRef.current(true)` fetches claims. Extended the top-of-file comment block to document this decision and describe when a conditional reload (post-failure) would be appropriate.

- [x] **2.2 — Fix dangling `setTimeout` in popup cleanup** The `cleanupListener` timeout (300,000 ms) is never cleared on successful popup completion. The `SIGNIN_SUCCESS` handler calls `clearInterval` and `popup?.close()` but does not call `cleanupListener()`. Add `cleanupListener()` to the success path to prevent a stale callback from firing 5 minutes later.
  > Stored the `setTimeout` return value in `let cleanupTimeoutId` (declared before `handleMessage` so the closure can reference it). In the success handler, `clearTimeout(cleanupTimeoutId)` is called first, then the listener removal and interval cancellation are inlined, removing the dependency on calling `cleanupListener()` and avoiding a forward-reference issue. The 5-minute stale callback can no longer fire after a successful auth.

- [x] **2.3 — Fix `signIn` function lacking try/catch** If `logtoSignIn` throws, the error propagates to the caller with no cleanup, potentially leaving the popup polling interval running. Wrap `logtoSignIn` calls in try/catch and ensure interval cleanup occurs on all error paths.
  > Added try/catch around both `logtoSignIn` calls (the `isInPopup` redirect path and the `!shouldUsePopup` direct redirect path). Also added a null-check guard immediately after `window.open()`: when the browser blocks the popup, the function now returns early before any interval or listener is created, preventing orphaned cleanup state.

- [x] **2.4 — Fix hard-coded post-callback redirect to `/`** `CallbackPage` always redirects to `window.location.href = '/'` on success. There is no prop to configure the post-auth redirect destination. Add a `redirectTo` prop (defaulting to `/`) so consumers can control where users land after authentication.
  > Added `redirectTo?: string` (with JSDoc) to `CallbackPageProps` and defaulted it to `'/'` in the component signature. The redirect line now uses `window.location.href = redirectTo`. Existing behaviour is unchanged for consumers that don't pass the prop.

- [x] **2.5 — Fix `validateLogtoConfig` using `Object.keys` on an array** `resources` in `LogtoConfig` is `string[]`, not a plain object. `Object.keys([]).length === 0` happens to work but is semantically wrong and fragile. Replace with a direct `.length` check on the array.
  > Replaced `Object.keys(config.resources).length === 0` with `config.resources.length === 0` in `validateLogtoConfig`. The old form worked coincidentally because `Object.keys` on an array returns numeric index strings, but it is semantically incorrect and would silently break if the type ever became a plain object.

- [x] **2.6 — Fix `verifyNextAuth` returning `success: false` for valid guests** When `allowGuest: true` and the token fails verification, `verifyNextAuth` returns `{ success: false, auth: <guestContext> }`. A caller checking only `result.success` will treat the guest as an auth failure. Change the return shape to `{ success: true, auth: guestContext }` for valid guest sessions, or use a separate `isGuest` flag.
  > Both guest paths in `verifyNextAuth` (no-token + `allowGuest`, and verification-error + `allowGuest`) now return `{ success: true, auth: guestContext }`. Callers should distinguish guests via `result.auth.isGuest`. The middleware tests that were asserting the old `success: false` shape were updated to assert `success: true` and include an explanatory comment.

- [x] **2.7 — Fix `MAX_ERROR_COUNT` forcing sign-out on transient network errors** Three consecutive `getAccessToken` failures trigger `logtoSignOut`. A brief network outage will log out the user. Distinguish between auth errors (4xx) and transient errors (network timeout, 5xx) and only sign out on confirmed auth failures. Add exponential backoff for transient errors.
  > Introduced error classification inside the `loadUser` catch block: transient errors (network failures surfaced as `TypeError`, strings like `networkerror`/`timeout`/`econnrefused`, or 5xx status codes in error messages) now follow an exponential-backoff retry path (up to 5 attempts, capped at 32 s) without clearing user state or signing the user out. Definite auth errors (`invalid`, `expired`, `invalid_grant`, etc.) retain the sign-out path. Added `transientErrorCount` and `backoffTimerRef` refs; the backoff timer is cleared on successful fetch, on unmount (new cleanup `useEffect`), and when transitioning to the unauthenticated state. This ensures a brief network outage self-heals without disrupting the user session.

---

## Phase 3 — Security Hardening

> Closes security gaps that could lead to token theft or auth bypass in production.

**Priority: 🟠 High**

- [x] **3.1 — Document XSS/cookie security limitation and provide `httpOnly` guidance** The auth token is stored in a non-`httpOnly` cookie, making it accessible to XSS. Since `httpOnly` cannot be set from JavaScript, document this limitation clearly. Provide a backend-assisted cookie-setting example where the server sets a proper `httpOnly`, `Secure`, `SameSite=Strict` cookie on behalf of the client.
  > Added a prominent ⚠️ SECURITY NOTICE block to `jwtCookieUtils.saveToken()` in `utils.ts` documenting the XSS limitation, what `Secure` + `SameSite=Strict` do/don't protect, and two concrete mitigations. Added `buildAuthCookieHeader(token, options)` to the backend entrypoint — generates a `Set-Cookie` header with `HttpOnly; Secure; SameSite=Strict` so backends can upgrade the cookie after verifying it. Includes full JSDoc with Express and Next.js `@example` blocks showing the recommended backend-assisted flow.

- [x] **3.2 — Add CSRF protection helpers for backend middleware** The Express and Next.js middleware only validates the JWT. Mutation endpoints (POST/PUT/DELETE) are vulnerable to CSRF. Provide a `csrfMiddleware` helper or integrate with an existing CSRF library, and document the threat model clearly.
  > Created `src/backend/csrf.ts` (exported from `src/backend/index.ts`) implementing the double-submit cookie pattern with no new dependencies. Exports: `generateCsrfToken()` (uses `globalThis.crypto.randomUUID` / `node:crypto` fallback), `buildCsrfCookieHeader()` (non-HttpOnly by design — JS must read it), `createCsrfMiddleware()` (Express: issues cookie on GET, validates on POST/PUT/PATCH/DELETE), `verifyCsrfToken()` (Next.js Route Handler helper returning `{ valid, error? }`), and the `CSRF_COOKIE_NAME` / `CSRF_HEADER_NAME` constants. The module header documents the full threat model: what CSRF is, how the double-submit pattern blocks it via same-origin policy, and explicit limitations (defence-in-depth only, not a CSP replacement).

- [x] **3.3 — Replace `Math.random()` UUID fallback with `crypto` in backend** `verify-auth.ts` uses `Math.random()` as a UUID fallback in the backend guest path. `Math.random()` is not cryptographically secure. Replace with `crypto.randomUUID()` (Node 16+) or `crypto.getRandomValues` for older Node targets.
  > The `generateUUID()` function was dead code — task 1.6 had already removed all three call sites that used it. Rather than replacing the `Math.random()` body with `crypto.randomUUID()`, the entire dead function was deleted. There is no longer any UUID generation in the backend; guest IDs come exclusively from the frontend cookie set by `guestUtils`.

- [x] **3.4 — Add JWKS cache invalidation on key rotation** If Logto rotates its signing keys, the 5-minute cache window causes a hard failure window. On JWT verification failure, invalidate the cached JWKS and retry once with a fresh fetch before returning the error to the caller.
  > Extracted the inner key-lookup + signature verification into a `verifyWithKeys()` helper. `verifyLogtoToken` now catches errors from `verifyWithKeys` and classifies them: if the error message indicates a key/signature problem (kid not found, signature verification failed, no keys), the cache entry is deleted and verification is retried once with a freshly fetched JWKS. Claims errors (wrong audience, expired token, missing scope) are explicitly NOT retried to avoid masking legitimate auth failures.

- [x] **3.5 — Validate JWT payload fields before use** `payload.sub`, `payload.aud`, `payload.iss`, etc. are used without null/undefined checks after `jose` decodes the token. Add a schema validation step (e.g., using `zod` or manual checks) on the decoded payload fields before trusting them.
  > Added `validatePayloadShape(payload: unknown): asserts payload is AuthPayload` — a TypeScript assertion function using manual checks (no `zod` dep). It verifies: `sub` is a non-empty string (required), `iss` is a string if present, `exp`/`nbf` are numbers if present, and `aud` is a `string | string[]` if present. Called inside `verifyWithKeys()` immediately after `jwtVerify()` returns, before any claim is accessed downstream. Avoids `zod` to keep the dep footprint minimal.

- [x] **3.6 — Harden postMessage origin check in popup flow** The `SIGNIN_SUCCESS` postMessage handler verifies `event.origin !== window.location.origin` but does not verify that `event.source === popup`. A same-origin script could spoof the success message. Add `event.source === popupRef.current` to the check.
  > Added `if (event.source !== popup) return` as a second guard in `handleMessage`, immediately after the origin check. The `popup` variable is already in closure scope (it's the `window.open()` return value), so no refactoring was needed. Added a block comment explaining both vectors being guarded against (cross-origin and same-origin spoof).

- [x] **3.7 — Make cookie security settings consistent across auth and guest cookies** `logto_authtoken` cookie uses `Secure: true` and `sameSite: 'strict'` via `cookieUtils.setCookie`. The guest ID cookie (`guestUtils.setGuestId`) uses a raw `document.cookie` string without `Secure`. Unify all cookie writes through a single `cookieUtils.setCookie` call with consistent security flags.
  > Replaced all three raw `document.cookie` operations in `guestUtils` with `cookieUtils` calls: `setGuestId` → `cookieUtils.setCookie` (with `secure: true`, `sameSite: 'strict'`, 7-day expiry matching `jwtCookieUtils`), `clearGuestId` → `cookieUtils.removeCookie`, and `getGuestId` → `cookieUtils.getCookie` (handles percent-encoded cookie names correctly). All cookie writes for both auth and guest tokens now flow through the same utility with identical security flags.

---

## Phase 4 — CI/CD & Release Infrastructure

> Without automated gates, regressions ship silently. This phase enables confident, automated releases.

**Priority: 🟠 High**

- [ ] **4.1 — Add GitHub Actions CI workflow** Create `.github/workflows/ci.yml` that runs on every push and PR: install deps → lint → type-check → test → build. Block merges if any step fails.

- [ ] **4.2 — Add automated publish workflow** Create `.github/workflows/publish.yml` triggered on GitHub Release creation. It should run the full CI suite, then `npm publish --access public`. Store the npm token as a GitHub secret.

- [ ] **4.3 — Add `CHANGELOG.md` and commit convention enforcement** Add a `CHANGELOG.md` starting at v0.1.8. Enforce Conventional Commits via `commitlint` + `husky` pre-commit hook. Use `standard-version` or `semantic-release` to auto-generate changelog entries on release.

- [ ] **4.4 — Add branch protection rules documentation** Document in `CONTRIBUTING.md` that `master` requires a passing CI check and one review before merge. (Actual rule enforcement is done in the GitHub repo settings, not code.)

- [x] **4.5 — Fix stale `copilot-instructions.md`** `.github/copilot-instructions.md` states "there are no automated tests in this repository," which is false. Update it to reflect the current test structure and coverage policy.
  > Replaced the stale "no automated tests" note with a full **Automated Tests** section listing all 6 test files with descriptions, the commands to run them (`npm test`, `npx vitest run`, coverage), and the coverage policy. Also corrected the linter section which falsely claimed "No linter configuration is present" — the repo does have `.eslintrc.json`; updated that line to describe it accurately.

---

## Phase 5 — Test Coverage Expansion

> Current tests are shallow and several are known-broken. This phase brings coverage to a level sufficient for confident refactoring.

**Priority: 🟡 Medium**

- [ ] **5.1 — Fix 12 broken `callback.test.tsx` tests** The `useHandleSignInCallback` mock is not working correctly, causing 12 test failures. Fix the mock setup so all callback flow scenarios are tested: success redirect, error with `onError`, popup success, popup failure.

- [ ] **5.2 — Fix broken navigation test in `user-center.test.tsx`** The navigation assertion test is noted as broken. Fix the mock router setup and restore the test.

- [ ] **5.3 — Add tests for popup sign-in flow** Write tests in `context.test.tsx` for: popup window opens, `SIGNIN_SUCCESS` message triggers state update and cleanup, popup blocked by browser, popup times out (5-minute cleanup fires).

- [ ] **5.4 — Add tests for `verifyTokenClaims` edge cases** In `verify-auth.test.ts`: add tests for `aud` as an array (both matching and non-matching), `aud` as `undefined`, `sub` as `undefined`, and expired tokens with clock skew.

- [ ] **5.5 — Add tests for JWKS cache invalidation** Replace the placeholder `expect(true).toBe(true)` cache test. Write tests verifying: cache hit within TTL, cache miss after TTL, cache invalidation on key rotation failure and retry.

- [ ] **5.6 — Add tests for `guestUtils` and `cookieUtils`** Write unit tests for `utils.ts` cookie helpers: set, get, delete, expiry, `Secure` flag in HTTPS context vs HTTP.

- [ ] **5.7 — Add tests for `bundler-config.ts` exports** Verify that `getViteConfig`, `getWebpackConfig`, and `getNextConfig` return the expected shape and do not include stale package names.

- [ ] **5.8 — Add integration test for Express middleware** Write a test using `supertest` against a real Express app with the middleware mounted. Test: valid JWT, expired JWT, missing JWT, guest token, scope enforcement.

- [ ] **5.9 — Add integration test for Next.js route handler** Write a test using `next-test-api-route-handler` or equivalent for `verifyNextAuth`: valid JWT, guest flow, missing token, `allowGuest: false` with no token.

- [ ] **5.10 — Set minimum coverage thresholds in Vitest config** Add `coverage.thresholds` to `vitest.config.ts`: statements ≥ 80%, branches ≥ 75%. Fail CI if thresholds are not met.

---

## Phase 6 — API Stability & Developer Experience

> Resolves confusing defaults, missing props, and inconsistencies that create friction for library consumers.

**Priority: 🟡 Medium**

- [ ] **6.1 — Change `useAuth` default redirect from `/404` to `/signin`** The default `redirectTo` value in `useAuth` is `/404`. This is a confusing default — unauthenticated users get a 404 page rather than a sign-in prompt. Change the default to `/signin` or make the default `undefined` and throw a helpful error if `requireAuth: true` is set without `redirectTo`.

- [ ] **6.2 — Add `redirectTo` prop to `CallbackPage`** As noted in Phase 2.4, the callback redirect is hard-coded to `/`. Expose a `redirectTo` prop (and respect `onSuccess` return values) for flexibility.

- [ ] **6.3 — Add customization props to `SignInPage`** `SignInPage` has no props for loading state, error display, or layout. Add at minimum: `loadingComponent`, `errorComponent`, and `className` props.

- [ ] **6.4 — Fix module-level `customNavigateFunction` singleton** `utils.ts` stores the navigation function as a module-level variable. In micro-frontend or multi-instance test environments, mounting a second `AuthProvider` overwrites it for all instances. Move this to React context so each `AuthProvider` has its own navigation scope.

- [ ] **6.5 — Export all TypeScript types from the package root** Review all types in `types.ts`, `backend/types.ts`, and inline interfaces. Ensure every public type is re-exported from the package entry points so consumers can use them without reaching into internal paths.

- [ ] **6.6 — Add `audience` as an array type in `VerifyAuthOptions`** `audience` is typed as `string` but multi-API setups require multiple audiences. Change type to `string | string[]` and update `verifyTokenClaims` accordingly.

- [ ] **6.7 — Make `AuthProvider` warn in development when required config is missing** Add runtime `console.warn` in development mode when `appId`, `endpoint`, or `resources` are missing/empty, pointing to the documentation. Helps catch misconfiguration early.

---

## Phase 7 — Documentation Overhaul

> Gaps in documentation are a major barrier to open-source adoption.

**Priority: 🟡 Medium**

- [ ] **7.1 — Add `CONTRIBUTING.md`** Cover: local dev setup, running tests, PR process, commit message conventions, and how to publish a release.

- [ ] **7.2 — Add troubleshooting guide to README** Common issues from `todo.md`: CORS errors, JWKS fetch failures, "Invalid audience", popup blocked, infinite redirect loop. Each should have a cause and fix.

- [ ] **7.3 — Document the implicit `/signin` route requirement for popup flow** The popup flow requires a `/signin` route to exist. This is not mentioned in the README. Add a note in the Popup Sign-In section explaining this dependency.

- [ ] **7.4 — Add migration guide for breaking changes** Create `MIGRATION.md` with a section for each minor version bump that introduced breaking changes. Start with the rename from `@ouim/better-logto-react` to `@ouim/simple-logto`.

- [ ] **7.5 — Add `CODE_OF_CONDUCT.md`** Add the Contributor Covenant or equivalent CoC file as expected by GitHub's community standards checker.

- [ ] **7.6 — Add security policy (`SECURITY.md`)** Document how to responsibly report security vulnerabilities (e.g., private GitHub security advisory), the disclosure timeline, and the supported versions.

- [ ] **7.7 — Update `copilot-instructions.md` with accurate test and architecture info** Replace stale content with current architecture overview, test patterns, and how to run/add tests.

- [ ] **7.8 — Add JSDoc examples for all backend exports** `verifyAuth`, `expressAuthMiddleware`, `verifyNextAuth`, `nextAuthMiddleware` all have JSDoc but lack `@example` blocks. Add minimal, copy-pasteable examples for each.

---

## Phase 8 — Reliability & Production Hardening

> Makes the library behave correctly under real-world conditions: serverless, high traffic, edge runtimes.

**Priority: 🟡 Medium**

- [ ] **8.1 — Make JWKS cache injectable / configurable** The JWKS cache is a module-level singleton `Map`. In serverless environments (Vercel, AWS Lambda), each cold start gets a fresh module scope making the cache useless. Expose a `cacheAdapter` option in `VerifyAuthOptions` (e.g., Redis, in-memory) so consumers can provide a persistent cache.

- [ ] **8.2 — Add rate limiting guidance for backend endpoints** The auth middleware does not rate-limit. Document and optionally provide a helper that integrates with `express-rate-limit` or similar, specifically for protecting the callback and user-info endpoints.

- [ ] **8.3 — Implement token refresh before expiration** Currently listed as unimplemented in `todo.md`. Add a background timer in `AuthProvider` that proactively refreshes the access token 60 seconds before `exp`, preventing mid-request token expiration.

- [ ] **8.4 — Add React Error Boundary to `AuthProvider`** Auth errors that bubble up to the render phase currently crash the entire app. Wrap `AuthProvider` internals in a React Error Boundary with a configurable `fallback` prop.

- [ ] **8.5 — Support Next.js App Router natively** The current `customNavigate` integration requires manual wiring with `useRouter`. Provide a `SimpleLogtoAppRouterProvider` that internally calls `useRouter` from `next/navigation`, so App Router users do not need to set up `customNavigate` manually.

- [ ] **8.6 — Add `onTokenRefresh` and `onSignOut` lifecycle callbacks to `AuthProvider`** Allow consumers to hook into these events for analytics, session logging, or syncing external state (e.g., clearing a Redux store on sign-out).

---

## Phase 9 — RBAC & Authorization Enhancements

> Expands the authorization model beyond a single scope string to support real enterprise use cases.

**Priority: 🟢 Low**

- [ ] **9.1 — Add multi-scope authorization helper** Provide `requireScopes(payload, ['read:users', 'write:users'])` with a mode option: `all` (must have all) or `any` (must have at least one). The current `requiredScope` only checks a single scope.

- [ ] **9.2 — Add role-based access control (RBAC) helpers** Provide `hasRole(payload, 'admin')` and `requireRole(payload, 'admin')` helpers that read Logto's `roles` claim from the JWT payload.

- [ ] **9.3 — Add `usePermission` hook for frontend** A React hook `usePermission(scope)` that returns `{ hasPermission: boolean }` based on the current user's token scopes, enabling conditional rendering without re-implementing JWT parsing on the frontend.

- [ ] **9.4 — Add multi-audience JWT verification** Allow `audience` to be an array in `verifyTokenClaims` (partially covered in 6.6) and handle scenarios where different API resources require different audience checks in the same middleware.

---

## Phase 10 — Ecosystem & Open Source Polish

> Final layer of polish expected by the open-source community for a well-maintained library.

**Priority: 🟢 Low**

- [ ] **10.1 — Add `funding` field to `package.json`** Add GitHub Sponsors or Open Collective link to `package.json` `funding` field. Encourages community sustainability.

- [ ] **10.2 — Add `engines` field to `package.json`** Specify minimum Node.js version (e.g., `"node": ">=16.0.0"`) so consumers get a clear error if their Node version is incompatible.

- [ ] **10.3 — Update `vite` devDependency to v5 or v6** `vite` is pinned to `^4.0.0` while v5 and v6 are current. Update and test the build to ensure compatibility. Vite 4 is EOL.

- [ ] **10.4 — Remove `.npmrc.backup` from the repository** `.npmrc.backup` is a leftover artifact that should not be in source control. Delete it and add `*.backup` to `.gitignore`.

- [ ] **10.5 — Add `sideEffects: false` to `package.json`** This enables tree-shaking in bundlers that support it. Since the library exports pure functions and React components with no global side effects on import, this is safe to set.

- [ ] **10.6 — Publish to JSR (JavaScript Registry) in addition to npm** JSR is the modern registry for TypeScript-first packages. Adding a `jsr.json` and publishing there increases discoverability in the Deno and modern TypeScript ecosystem.

- [ ] **10.7 — Add GitHub issue and PR templates** Create `.github/ISSUE_TEMPLATE/bug_report.md`, `feature_request.md`, and `PULL_REQUEST_TEMPLATE.md` to guide contributors and reduce low-quality issues.

- [ ] **10.8 — Archive or convert `todo.md` to GitHub Issues** Move all items in `todo.md` to tracked GitHub Issues with labels (`bug`, `enhancement`, `security`). The file can remain as a high-level index linking to issues, but individual tracking should be on GitHub for public visibility.
