# Improvement Tasks v2 — `@ouim/simple-logto`

> Cleaned-up roadmap for making this library production-ready and open-source quality. This version keeps the completed tasks and their implementation notes, removes stale duplication, and separates real release blockers from optional ecosystem work.

---

## Priority Legend

- 🔴 **Critical** — security, packaging, or correctness issues that can break consumers
- 🟠 **High** — real reliability gaps or release/process issues that should be fixed before wider adoption
- 🟡 **Medium** — meaningful DX, docs, or hardening work that improves confidence and maintainability
- 🟢 **Low** — ecosystem polish and optional enhancements

---

## Current Critical Regressions

> These are active library-level issues confirmed after the initial hardening pass. They should be fixed before treating the package and example app as a reliable auth sandbox.

**Priority: 🔴 Critical**

- [ ] **CR-1 — Fix popup sign-in completion not rehydrating auth state in the parent app** Popup auth can complete successfully while `useAuth()` still reports `user: null` until the page is manually refreshed.

  > Confirmed as a library issue in `src/context.tsx`. The popup completion handlers call `loadUserRef.current(true)`, but that path still depends on `useLogto()` already having flipped `isAuthenticated` in the parent window. When the popup closes before the parent Logto instance finishes rehydrating from shared storage, `loadUser()` falls through the unauthenticated branch and leaves the app signed out until a full reload reconstructs the provider.

- [ ] **CR-2 — Fix local sign-out so `signOut({ global: false })` cannot cascade into tenant-wide logout** Consumers need a trustworthy app-local sign-out path that never logs them out of the entire Logto tenant as a side effect.
  > Confirmed as a library issue in `src/context.tsx`. The local sign-out branch clears React state and cookies, but it does not establish a durable local-only signed-out state in the underlying Logto session. On subsequent auth re-sync, the provider can still see an SDK-authenticated session and enter error-driven global logout paths. The implementation needs a true local-session clearing strategy and regression tests proving `global: false` never invokes tenant-wide logout behavior.

> User test: Local signout doesn't work at all, nor on userCenter or a dedicated sign-out function

- [ ] **CR-3 — Make `UserCenter` sign-out defaults safe and explicit** A drop-in account menu should not globally log the user out of their whole identity-provider session unless they opt into that behavior.

  > Confirmed as a library issue in `src/user-center.tsx`. `globalSignOut` currently defaults to `true`, so a consumer that renders `UserCenter` without extra props gets tenant-wide logout by default. That default is too risky for a shared UI primitive and should either change to local sign-out or become explicitly named/labeled so it cannot be mistaken for a normal app logout.

---

## Phase 1 — Critical Packaging & Security Fixes

> These were blocking issues affecting correctness, package quality, or security expectations for consumers.

**Priority: 🔴 Critical**

- [x] **1.1 — Move `vitest` to `devDependencies`** `vitest` was listed under `dependencies`, causing dev tooling to be installed in consumer projects.

  > Removed `vitest` from `dependencies` and added it alongside `@vitest/ui` in `devDependencies`. The `@vitest/ui` sibling entry was already in devDeps, so this is now consistent.

- [x] **1.2 — Fix stale package name in `bundler-config.ts`** `getBundlerConfig()` referenced `@ouim/better-logto-react`, which is no longer the package name.

  > Replaced `@ouim/better-logto-react` with `@ouim/simple-logto` in the `optimizeDeps.include` array inside the `vite` case of `getBundlerConfig()`. The stale name was the only occurrence in the file.

- [x] **1.3 — Fix React peer dependency range to include React 18** The original peer range skipped React 18, which caused unnecessary install warnings for most users.

  > Updated both `react` and `react-dom` peer dependency ranges to include `^18.0.0`. React 18 is currently the dominant version in use, so this was a significant gap causing spurious npm warnings on install.

- [x] **1.4 — Fix JWT audience array support (RFC 7519 compliance)** `verifyTokenClaims` originally treated `aud` as a single string even though JWT allows a string array.

  > Updated the audience check in `verifyTokenClaims` to use `Array.isArray(aud) ? aud.includes(audience) : aud === audience`. Also added explicit `aud?: string | string[]` (and other standard JWT claims) to the `AuthPayload` interface in `types.ts` for proper typing.

- [x] **1.5 — Fix inconsistent issuer construction in `verifyTokenClaims`** JWKS fetch and issuer verification used different URL construction strategies, which could disagree when `logtoUrl` had a path suffix.

  > Replaced `new URL('oidc', logtoUrl).toString()` with `${normalizedLogtoUrl}/oidc` in `verifyTokenClaims`, mirroring the same strip-trailing-slash + append pattern used by `fetchJWKS`. The `new URL` relative resolution would silently replace the last path segment when `logtoUrl` contained a path.

- [x] **1.6 — Fix unstable guest ID on backend requests** The backend generated a new guest UUID when no guest cookie existed, which made guest identity non-persistent across requests.

  > Replaced all three `generateUUID()` fallbacks in `extractGuestTokenFromCookies` with `null`. Guest identity is established on the frontend (which sets the persistent `guest_logto_authtoken` cookie); the backend should only read it. When no cookie exists `guestId` resolves to `undefined` in the auth context, which is the correct "no guest identity yet" signal to callers.

---

## Phase 2 — Bug Fixes: Auth Flow Correctness

> These fixes addressed real behavior bugs in sign-in, callback, and guest flows.

**Priority: 🟠 High**

- [x] **2.1 — Fix popup sign-in race condition and unnecessary reload** Popup completion triggered async refresh work and then immediately reloaded the page, discarding that work.

  > Removed `window.location.reload()` from all three popup-completion paths (postMessage handler, localStorage fallback handler, and popup-closed poll handler). All three were calling `loadUserRef.current(true)` and `window.location.reload()` on the same synchronous tick; the reload navigated away and killed the in-flight async state update, making the `loadUserRef` call dead code. The `POPUP_AUTH_EVENT_DELAY` (500 ms) is sufficient for Logto's React SDK to sync from shared localStorage before `loadUserRef.current(true)` fetches claims. Extended the top-of-file comment block to document this decision and describe when a conditional reload (post-failure) would be appropriate.

- [x] **2.2 — Fix dangling `setTimeout` in popup cleanup** The popup cleanup timeout was not cleared on successful sign-in.

  > Stored the `setTimeout` return value in `let cleanupTimeoutId` (declared before `handleMessage` so the closure can reference it). In the success handler, `clearTimeout(cleanupTimeoutId)` is called first, then the listener removal and interval cancellation are inlined, removing the dependency on calling `cleanupListener()` and avoiding a forward-reference issue. The 5-minute stale callback can no longer fire after a successful auth.

- [x] **2.3 — Fix `signIn` function lacking try/catch** A thrown `logtoSignIn` call could leave popup bookkeeping behind.

  > Added try/catch around both `logtoSignIn` calls (the `isInPopup` redirect path and the `!shouldUsePopup` direct redirect path). Also added a null-check guard immediately after `window.open()`: when the browser blocks the popup, the function now returns early before any interval or listener is created, preventing orphaned cleanup state.

- [x] **2.4 — Add configurable post-callback redirect** `CallbackPage` used a hard-coded redirect to `/`.

  > Added `redirectTo?: string` (with JSDoc) to `CallbackPageProps` and defaulted it to `'/'` in the component signature. The redirect line now uses `window.location.href = redirectTo`. Existing behaviour is unchanged for consumers that don't pass the prop.

- [x] **2.5 — Fix `validateLogtoConfig` using `Object.keys` on an array** `resources` is a `string[]`, so the old implementation was semantically wrong even if it happened to work.

  > Replaced `Object.keys(config.resources).length === 0` with `config.resources.length === 0` in `validateLogtoConfig`. The old form worked coincidentally because `Object.keys` on an array returns numeric index strings, but it is semantically incorrect and would silently break if the type ever became a plain object.

- [x] **2.6 — Fix `verifyNextAuth` returning `success: false` for valid guests** That shape caused guest sessions to look like auth failures to common callers.

  > Both guest paths in `verifyNextAuth` (no-token + `allowGuest`, and verification-error + `allowGuest`) now return `{ success: true, auth: guestContext }`. Callers should distinguish guests via `result.auth.isGuest`. The middleware tests that were asserting the old `success: false` shape were updated to assert `success: true` and include an explanatory comment.

- [x] **2.7 — Fix transient network errors forcing sign-out** The previous `MAX_ERROR_COUNT` behavior could log users out during short outages.

  > Introduced error classification inside the `loadUser` catch block: transient errors (network failures surfaced as `TypeError`, strings like `networkerror`/`timeout`/`econnrefused`, or 5xx status codes in error messages) now follow an exponential-backoff retry path (up to 5 attempts, capped at 32 s) without clearing user state or signing the user out. Definite auth errors (`invalid`, `expired`, `invalid_grant`, etc.) retain the sign-out path. Added `transientErrorCount` and `backoffTimerRef` refs; the backoff timer is cleared on successful fetch, on unmount (new cleanup `useEffect`), and when transitioning to the unauthenticated state. This ensures a brief network outage self-heals without disrupting the user session.

---

## Phase 3 — Security Hardening

> These tasks hardened the package against common auth-library failure modes and misuse.

**Priority: 🟠 High**

- [x] **3.1 — Document XSS/cookie security limitation and provide `httpOnly` guidance** The frontend cannot set `HttpOnly`, so the limitation needed to be explicit.

  > Added a prominent SECURITY NOTICE block to `jwtCookieUtils.saveToken()` in `utils.ts` documenting the XSS limitation, what `Secure` + `SameSite=Strict` do/don't protect, and two concrete mitigations. Added `buildAuthCookieHeader(token, options)` to the backend entrypoint — generates a `Set-Cookie` header with `HttpOnly; Secure; SameSite=Strict` so backends can upgrade the cookie after verifying it. Includes full JSDoc with Express and Next.js `@example` blocks showing the recommended backend-assisted flow.

- [x] **3.2 — Add CSRF protection helpers for backend middleware** Backend auth helpers validated JWTs but did not help consumers protect state-changing routes.

  > Created `src/backend/csrf.ts` (exported from `src/backend/index.ts`) implementing the double-submit cookie pattern with no new dependencies. Exports: `generateCsrfToken()` (uses `globalThis.crypto.randomUUID` / `node:crypto` fallback), `buildCsrfCookieHeader()` (non-HttpOnly by design — JS must read it), `createCsrfMiddleware()` (Express: issues cookie on GET, validates on POST/PUT/PATCH/DELETE), `verifyCsrfToken()` (Next.js Route Handler helper returning `{ valid, error? }`), and the `CSRF_COOKIE_NAME` / `CSRF_HEADER_NAME` constants. The module header documents the full threat model: what CSRF is, how the double-submit pattern blocks it via same-origin policy, and explicit limitations (defence-in-depth only, not a CSP replacement).

- [x] **3.3 — Remove insecure backend UUID fallback** The prior task was to replace a `Math.random()` fallback, but the code path was dead.

  > The `generateUUID()` function was dead code — task 1.6 had already removed all three call sites that used it. Rather than replacing the `Math.random()` body with `crypto.randomUUID()`, the entire dead function was deleted. There is no longer any UUID generation in the backend; guest IDs come exclusively from the frontend cookie set by `guestUtils`.

- [x] **3.4 — Add JWKS cache invalidation on key rotation** A stale 5-minute JWKS cache could create a failure window when keys rotated.

  > Extracted the inner key-lookup + signature verification into a `verifyWithKeys()` helper. `verifyLogtoToken` now catches errors from `verifyWithKeys` and classifies them: if the error message indicates a key/signature problem (kid not found, signature verification failed, no keys), the cache entry is deleted and verification is retried once with a freshly fetched JWKS. Claims errors (wrong audience, expired token, missing scope) are explicitly NOT retried to avoid masking legitimate auth failures.

- [x] **3.5 — Validate JWT payload fields before use** The code previously trusted decoded payload fields without validating required shape.

  > Added `validatePayloadShape(payload: unknown): asserts payload is AuthPayload` — a TypeScript assertion function using manual checks (no `zod` dep). It verifies: `sub` is a non-empty string (required), `iss` is a string if present, `exp`/`nbf` are numbers if present, and `aud` is a `string | string[]` if present. Called inside `verifyWithKeys()` immediately after `jwtVerify()` returns, before any claim is accessed downstream. Avoids `zod` to keep the dep footprint minimal.

- [x] **3.6 — Harden postMessage origin check in popup flow** Same-origin spoofing needed to be blocked in addition to cross-origin messages.

  > Added `if (event.source !== popup) return` as a second guard in `handleMessage`, immediately after the origin check. The `popup` variable is already in closure scope (it's the `window.open()` return value), so no refactoring was needed. Added a block comment explaining both vectors being guarded against (cross-origin and same-origin spoof).

- [x] **3.7 — Make cookie security settings consistent across auth and guest cookies** Guest cookie writes did not go through the same secure path as auth cookies.

  > Replaced all three raw `document.cookie` operations in `guestUtils` with `cookieUtils` calls: `setGuestId` → `cookieUtils.setCookie` (with `secure: true`, `sameSite: 'strict'`, 7-day expiry matching `jwtCookieUtils`), `clearGuestId` → `cookieUtils.removeCookie`, and `getGuestId` → `cookieUtils.getCookie` (handles percent-encoded cookie names correctly). All cookie writes for both auth and guest tokens now flow through the same utility with identical security flags.

---

## Phase 4 — CI/CD & Release Infrastructure

> This phase established baseline release discipline and automated verification.

**Priority: 🟠 High**

- [x] **4.1 — Add GitHub Actions CI workflow** Run lint, type-check, tests, and build on pushes and PRs.

  > Created `.github/workflows/ci.yml` triggered on push/PR to `master` and `rc`. Runs a matrix across Node 18, 20, and 22 with four sequential steps: `npm run lint` → `npx tsc --noEmit` (type-check without emitting) → `npx vitest run` (single-pass tests) → `npm run build`. All steps must pass; GitHub's branch-protection "require status checks" setting can be pointed at this workflow to block merges on failure.

- [x] **4.2 — Add automated publish workflow** Publish only after the full CI gate passes.

  > Created `.github/workflows/publish.yml` triggered on `release: created`. Runs the identical CI gate (lint → type-check → test → build) before publishing, so a broken release can never reach npm. Publishes with `--provenance` (npm's signed-attestation feature, requires `id-token: write` permission) for supply-chain transparency. The npm token must be stored as `NPM_TOKEN` in the repo's GitHub Secrets.

- [x] **4.3 — Add `CHANGELOG.md` and commit convention guidance** Release hygiene should be documented consistently.

  > Created `CHANGELOG.md` starting at v0.1.8 with an `[Unreleased]` section summarising all Phase 1–4 work, and documented Conventional Commits guidance in the contributor docs. The older task note claiming active local hook-based enforcement is no longer accurate for the current repository state, so it has been corrected here. `standard-version`/`semantic-release` remains a future choice — the Keep-a-Changelog format used here is compatible with both.

- [x] **4.4 — Add branch protection rules documentation** The merge policy needed to be stated in repo docs even though enforcement lives in GitHub settings.

  > Created `CONTRIBUTING.md` covering: local dev setup, running tests, Conventional Commits convention (with scope table and breaking-change syntax), PR process (branch off `rc`, gate commands, squash-merge policy), branch protection tables for both `master` and `rc` (required checks, approval count, force-push disabled), and the full release process (CHANGELOG → version bump → RC merge → GitHub Release triggers publish workflow).

- [x] **4.5 — Fix stale `copilot-instructions.md`** Repo automation docs should match reality.

  > Replaced the stale "no automated tests" note with a full **Automated Tests** section listing all 6 test files with descriptions, the commands to run them (`npm test`, `npx vitest run`, coverage), and the coverage policy. Also corrected the linter section which falsely claimed "No linter configuration is present" — the repo does have `.eslintrc.json`; updated that line to describe it accurately.

---

## Phase 5 — Test Coverage Expansion

> This phase raised confidence enough to refactor and harden behavior without guessing.

**Priority: 🟠 High**

- [x] **5.1 — Fix broken `callback.test.tsx` tests** Restore meaningful coverage of callback flows rather than leaving known-broken tests behind.

  > Fixed the callback mock/setup so the previously broken scenarios now run correctly, covering redirect success, popup success, error paths, and callback cleanup behavior.

- [x] **5.2 — Fix broken navigation test in `user-center.test.tsx`** The navigation test had drifted from the current implementation.

  > Reworked the mock router/setup so the "navigate to page link" assertion is now valid and stable.

- [x] **5.3 — Add tests for popup sign-in flow** Popup auth was one of the most complex pieces of the package and needed explicit coverage.

  > Added a new `Popup Sign-in Flow` describe block (7 tests) to `context.test.tsx`. Tests cover: (1) popup opens with correct URL+features, (2) popup blocked returns early with console.warn, (3) SIGNIN*SUCCESS closes popup and clears listener, (4) SIGNIN_COMPLETE alias also accepted, (5) cross-origin messages rejected, (6) same-origin spoof (wrong source) rejected, (7) 5-minute auto-cleanup removes message listener. The source-check tests use a plain object (not a real `MessageEvent`) since the handler only reads `.origin`, `.source`, and `.data` — no real DOM event needed. The timeout test switches to `vi.useFakeTimers()` \_after* the initial render/`waitFor` to avoid disrupting React's async effect scheduling.

- [x] **5.4 — Add tests for `verifyTokenClaims` edge cases** The backend verifier needed tests for audience and claim-shape edge cases.

  > Added two new outer `describe` blocks to `verify-auth.test.ts`: `verifyTokenClaims — audience array (RFC 7519)` (3 tests: aud-array match, aud-array mismatch, no audience option) and `validatePayloadShape — required field enforcement` (6 tests: missing sub, empty sub, missing iss, non-numeric exp, expired-at-boundary using `vi.useFakeTimers`, and non-string/array aud). Also fixed the root cause of pre-existing test instability: the outer `beforeEach` used `vi.clearAllMocks()` which does NOT flush `mockResolvedValueOnce` queues — replaced with `vi.resetAllMocks()` throughout the file.

- [x] **5.5 — Add tests for JWKS cache invalidation** Replace placeholder tests with real cache-behavior verification.

  > Replaced the placeholder with three real cache tests inside the existing `JWKS Fetching` describe: (1) cache hit — second call within TTL doesn't call `fetch`; (2) cache miss after TTL — `vi.useFakeTimers()` advances clock 5 min+1s, verifying `fetch` is called twice; (3) key-rotation retry — first `jwtVerify` throws `ERR_JWS_SIGNATURE_VERIFICATION_FAILED`, cache is invalidated, `fetch` is called a second time, and the retry succeeds. Each test uses a unique `logtoUrl` to get a fresh cache entry.

- [x] **5.6 — Add tests for `guestUtils` and `cookieUtils`** Cookie and guest behavior needed direct unit coverage.

  > Created `src/utils.test.ts` (25 tests). Covers `cookieUtils` (set with encoding, get, overwrite, SSR guard, remove), `jwtCookieUtils` (saveToken/getToken/removeToken round-trip), and `guestUtils` (getGuestId, setGuestId with provided ID / fingerprint / UUID fallback, ensureGuestId, clearGuestId, generateGuestId happy path and fallback). FingerprintJS is mocked via `vi.mock()` factory; individual fallback paths are tested via `mockRejectedValueOnce`. Note: `Secure` flag enforcement is a browser-level restriction that happy-dom does not simulate, so that dimension is implicitly tested via the flag being present in the cookie string passed to `document.cookie`.

- [x] **5.7 — Add tests for `bundler-config.ts` exports** Config helpers should be tested as public API.

  > Created `src/bundler-config.test.ts` (17 tests). Verifies `getBundlerConfig('vite')` returns `optimizeDeps.include: ['@logto/react']` and `resolve.alias: { jose: 'jose/dist/node/cjs' }`, that webpack and nextjs configs have `resolve` but NOT `optimizeDeps`, that nextjs and webpack configs produce identical shapes, that no config contains the stale `@ouim/better-logto-react` name, and that the pre-built `viteConfig`/`webpackConfig`/`nextjsConfig` named exports equal their `getBundlerConfig()` counterparts.

- [x] **5.8 — Add integration test for Express middleware** The Express middleware needed an end-to-end test using a real app.

  > Added `src/backend/express.integration.test.ts` using a real Express app plus `supertest`. The suite mounts `createExpressAuthMiddleware()` and covers the requested end-to-end cases: valid auth cookie, expired token rejection, missing-token 401, guest-cookie fallback, and required-scope enforcement. Added `express`/`supertest` and their TypeScript types as devDependencies to support this integration-level coverage without changing the published package surface.

- [x] **5.9 — Add integration test for Next.js route handler** `verifyNextAuth` needed route-level verification without requiring a full Next runtime.

  > Added `src/backend/next-route.integration.test.ts` with a small route-handler harness around `verifyNextAuth()`. The test uses a real `Headers` object and a minimal request adapter rather than the full Next runtime, which avoids adding `next` as a dev dependency while still covering route-level behavior. It verifies the requested scenarios: authenticated JWT session, guest-cookie flow, missing-token 401, and explicit `allowGuest: false` with no token.

- [x] **5.10 — Set minimum coverage thresholds in Vitest config** CI should fail on real coverage regressions.

  > Added `coverage.thresholds` to `vitest.config.ts` with conservative baselines just below the actual Phase-5 coverage numbers (statements 60%, branches 50%, functions 70%, lines 60%). Also installed `@vitest/coverage-v8` as a devDependency (pinned to `^4.0.18` to stay in-sync with `vitest`). The thresholds are intentionally set lower than the aspirational 80%/75% targets because `context.tsx` and `utils.ts` have significant untested code paths (the complex auth-error/retry logic); they should be raised incrementally alongside later tests. A comment in `vitest.config.ts` documents the intention and the final targets.

---

## Phase 6 — API Stability & Developer Experience

> These changes reduced confusion in the public API and removed hidden coupling.

**Priority: 🟡 Medium**

- [x] **6.1 — Change `useAuth` default redirect from `/404` to `/signin`** Unauthenticated users should not hit a 404 by default.

  > Changed `redirectTo || '/404'` to `redirectTo || '/signin'` in the `middleware === 'auth'` branch of `useAuth`. Updated the JSDoc `@param` description to document the new default. Updated the corresponding test in `useAuth.test.tsx` that was asserting `/404` — it now asserts `/signin` and includes a comment explaining the semantic change. No other call sites reference this default.

- [x] **6.2 — Add customization props to `SignInPage`** `SignInPage` needed minimal presentation and error hooks.

  > Added a new public `SignInPageProps` type and wired `SignInPage` to accept `loadingComponent`, `errorComponent`, and `className`. The component now tracks sign-in bootstrap failures with local state instead of fire-and-forget `signIn(undefined, false)`, rendering either a caller-supplied error UI or a default `<div role="alert">Failed to start sign-in. Please try again.</div>` message. Added `src/signin.test.tsx` covering custom loading UI, default error UI, and functional custom error rendering.

- [x] **6.3 — Fix module-level `customNavigateFunction` singleton** Navigation behavior should be provider-scoped, not global mutable module state.

  > Added `src/navigation.tsx` with a provider-scoped navigation context and switched `AuthProvider` to wrap its tree with `NavigationProvider` instead of mutating a module singleton. `useAuth` and `UserCenter` now resolve navigation from the nearest provider, while `utils.navigateTo` remains as the browser fallback. Added coverage proving nested `AuthProvider` instances keep independent `customNavigate` handlers, which closes the cross-instance override bug in micro-frontend and multi-provider test setups.

- [x] **6.4 — Export all public TypeScript types from package entrypoints** Consumers should not need internal import paths for supported types.

  > Root `src/index.ts` now re-exports the previously missing frontend public types: `AuthContextType`, `AuthProviderProps`, and `SignInPageProps`. Also removed the duplicate inline `CallbackPageProps` declaration from `callback.tsx` so the shared `src/types.ts` definition is the single source of truth. The backend entrypoint already re-exported `src/backend/types.ts`; README examples were updated to show the full supported type import surface from both `@ouim/simple-logto` and `@ouim/simple-logto/backend`.

- [x] **6.5 — Add `audience` array support to `VerifyAuthOptions`** Multi-resource APIs need `string | string[]` rather than a single audience string.

  > Updated `VerifyAuthOptions.audience` to `string | string[]` and changed `verifyTokenClaims()` to treat both the expected audiences and token `aud` claim as arrays, succeeding on any intersection. Added tests covering matching and non-matching option-side audience arrays, and updated the backend docs/README examples to document the expanded type.

- [x] **6.6 — Add development warnings for missing required config** Consumers should get fast feedback before they hit runtime auth failures.

  > Added a `process.env.NODE_ENV !== 'production'` guarded block at the top of the `validateLogtoConfig` `useEffect` in `AuthProvider`. Emits three distinct `[simple-logto]`-prefixed warnings: one for missing/empty `appId`, one for missing/empty `endpoint`, and one for an empty `resources` array — each with a brief explanation and a link to the relevant Logto docs page. The existing `validateLogtoConfig()` call still runs immediately after and throws for truly invalid configs. Added 4 tests in `context.test.tsx` (`Development Config Warnings` describe block) covering all three warning cases plus the negative case (no resources-warning when resources are present).

---

## Phase 7 — Documentation Overhaul

> These tasks improved the package’s usability as an open-source auth library.

**Priority: 🟡 Medium**

- [x] **7.1 — Verify and keep `CONTRIBUTING.md` current** The file already existed, so the task is to keep it aligned rather than re-add it.

  > `CONTRIBUTING.md` was already present and fully covered the requested scope before this session. Verified here that it includes local setup, test commands, PR workflow, commit conventions, branch-protection notes, and release publishing steps, so the task list was updated to match repository state.

- [x] **7.2 — Add troubleshooting guide to README** Users need common failure modes documented with causes and fixes.

  > Added a dedicated `## Troubleshooting` section to `README.md` covering all requested issues. Each entry now has an explicit cause/fix breakdown focused on the actual integration points in this package: CORS + credentials for backend cookie flows, JWKS endpoint reachability and cache refresh behavior, audience/resource mismatches, popup browser restrictions plus the `/signin` dependency, and common redirect-loop misconfiguration traps around `/callback`, `callbackUrl`, route protection, and custom navigation.

- [x] **7.3 — Document the implicit `/signin` route requirement for popup flow** Popup sign-in depends on a real route existing in the host app.

  > Added an explicit note to the `SignInPage` section in `README.md`: popup sign-in still needs a real `/signin` route that renders `SignInPage`, because the popup window navigates there before it starts the Logto flow. This makes the routing dependency visible where consumers configure sign-in UI.

- [x] **7.4 — Add `CODE_OF_CONDUCT.md`** This is expected by GitHub community standards and by external contributors.

  > Added a repository-root `CODE_OF_CONDUCT.md` with an equivalent project policy covering expected behavior, unacceptable conduct, scope, enforcement, and private reporting guidance. Kept it concise and GitHub-community-standards-friendly without introducing extra maintenance burden or project-specific process overhead.

- [x] **7.5 — Add JSDoc examples for backend exports** Backend examples should be copy-pasteable and aligned with the real API surface.

  > Verified that the current backend API surface already had example blocks on the main auth helpers (`verifyLogtoToken`, `createExpressAuthMiddleware`, `verifyNextAuth`, `verifyAuth`, `buildAuthCookieHeader`, `createCsrfMiddleware`, `verifyCsrfToken`). Filled the remaining gap by adding `@example` blocks to the exported CSRF helpers `generateCsrfToken()` and `buildCsrfCookieHeader()`. The old task wording was stale: there is no `nextAuthMiddleware` export in the current package, and the Express helper is named `createExpressAuthMiddleware`.

---

## Phase 8 — Release Blockers Still Open

> These are the highest-value remaining tasks before calling the package production-ready for broad external use.

**Priority: 🟠 High**

- [x] **8.1 — Add consumer smoke tests using packed tarballs** Validate the published package the way users consume it, not just the repo source.

  > Create fixture consumers for at least:
  >
  > - Vite React app importing `@ouim/simple-logto`
  > - Node/Express app importing `@ouim/simple-logto/backend`
  > - Build config importing `@ouim/simple-logto/bundler-config` Use `npm pack` in CI, install the tarball into each fixture, and verify install/build/import behavior. This catches broken `exports`, missing files, incorrect type paths, and CJS/ESM packaging regressions.
  >
  > Added a checked-in `smoke-fixtures/` matrix plus `scripts/run-packed-smoke-tests.mjs`, which packs the current build into a tarball, installs that tarball into three isolated fixture apps, and verifies the consumer paths end to end. The Vite fixture runs `tsc` + `vite build` against the root entrypoint, the backend fixture runs `tsc` plus both ESM and CJS runtime imports against `@ouim/simple-logto/backend`, and the bundler fixture does the same for `@ouim/simple-logto/bundler-config`. Wired `npm run test:smoke` into both `ci.yml` and `publish.yml`, and updated the contributor instructions/local gate to include it.

- [x] **8.2 — Add `SECURITY.md` with a vulnerability disclosure policy** This package handles authentication and should provide a private reporting path.

  > Document where vulnerabilities should be reported, whether GitHub Security Advisories are supported, expected disclosure handling, and which versions are supported for security fixes.
  >
  > Added repository-root `SECURITY.md` with a private disclosure policy, supported-version guidance tied to the latest release / current `rc` line, explicit instruction not to file public issues, and two reporting paths: GitHub Security Advisories (when enabled) plus `security@ouim.dev`. Also documented acknowledgement targets, coordinated disclosure expectations, and the package surface covered by the policy.

- [x] **8.3 — Implement proactive token refresh before expiration** Token refresh is still one of the biggest production-readiness gaps.

  > Add a background timer in `AuthProvider` that refreshes the access token shortly before `exp`, avoids duplicate refreshes, clears timers on sign-out/unmount, and is covered by tests for refresh success, refresh failure, and expired refresh-token fallback.
  >
  > Added a provider-level proactive refresh timer in `src/context.tsx` that schedules a forced auth reload 60 seconds before the access token expires, keeping the backend auth cookie aligned with the token actually written to `logto_authtoken`. The timer is cleared on sign-out, unmount, and unauthenticated transitions, and the implementation now guards both against overlapping timer-driven refresh attempts and against tight retry loops when a refresh returns an access token with an unchanged `exp`. Added coverage in `src/context.test.tsx` for access-token-driven scheduling, auth-error refresh failure, the null-access-token fallback that forces logout when the refresh token is effectively expired, and the unchanged-`exp` edge case raised in review.

- [x] **8.4 — Make package scripts cross-platform** NPM scripts should work reliably for contributors on Windows, macOS, and Linux.

  > Replace shell-specific commands such as `rm -rf dist` with a cross-platform tool like `rimraf`, then verify the documented commands in `AGENTS.md` / `CONTRIBUTING.md` still work on Windows and on CI Linux.
  >
  > Replaced the `clean` script in `package.json` from `rm -rf dist` to `rimraf dist` and added `rimraf` as an explicit devDependency so the script no longer depends on POSIX shell semantics. Verified on Windows by running `npm run clean` and `npm run build`; the documented command names in `AGENTS.md` and `CONTRIBUTING.md` remain accurate because only the underlying implementation changed.

- [x] **8.5 — Add explicit runtime support policy** Production libraries should clearly define supported environments and enforce them where reasonable.

  > Add an `engines` field to `package.json`, document supported Node/React/`@logto/react` ranges in the README, and align CI with the declared support matrix instead of leaving compatibility implicit.
  >
  > Added `engines.node` to `package.json` with an explicit supported Node policy (`^18.18.0 || ^20.0.0 || ^22.0.0`), documented the supported Node/React/`@logto/react` ranges in a new `README.md` runtime-support section, and changed GitHub Actions to verify the package on Node 18/20/22. The publish workflow now runs on Node 22 so release automation also stays within the declared support matrix.

- [x] **8.6 — Add package-content / export audit checks** Public package structure should be validated automatically.

  > Add a CI step that verifies the final tarball contains the expected `dist` files and entrypoints, and that README examples only use supported public imports. This should fail if an export path is removed, renamed, or points at a missing declaration file.
  >
  > Added `scripts/run-package-audit.mjs` plus `npm run test:package`. The audit runs `npm pack --json`, verifies the tarball contains the required published metadata files and every file referenced by `main` / `module` / `types` / `exports`, and scans README code fences for `@ouim/simple-logto` imports so unsupported subpaths fail the build. Wired it into both GitHub Actions workflows after `npm run build`, and updated the local gate docs in `AGENTS.md` and `CONTRIBUTING.md` to include the new check.

---

## Phase 9 — Reliability & Hardening

> These tasks improve behavior under real deployment conditions without expanding the public surface too aggressively.

**Priority: 🟡 Medium**

- [x] **9.1 — Make JWKS cache configurable** The current module-level in-memory cache is reasonable for many apps, but not ideal everywhere.

  > Start with TTL configurability and explicit cache controls. Only add a pluggable cache adapter if a concrete use case justifies the extra API surface. The first step should be small and testable, not a Redis abstraction by default.
  >
  > Added two small, explicit cache controls to `VerifyAuthOptions`: `jwksCacheTtlMs` to override the default 5 minute per-process JWKS TTL and `skipJwksCache` to bypass the cache for a given verifier/middleware instance. Also exported `invalidateJwksCache(logtoUrl)` and `clearJwksCache()` from the backend entrypoint so operators and tests can force a refresh without restarting the process. Added focused verifier tests for custom TTL expiry, cache bypass, and explicit invalidation, and documented the new controls in both backend docs surfaces.

- [x] **9.2 — Review and remove unnecessary reload behavior in `SignInPage`** Forced reloads should be eliminated or documented as an explicit contract.

  > `src/signin.tsx` still reloads the page when the user is already authenticated and the current path is `/`. Confirm whether this is actually needed for Logto state synchronization; if not, remove it. If it is needed, document the exact reason and scope so consumers understand the tradeoff.
  >
  > Removed the `window.location.reload()` branch from `SignInPage` when an already-authenticated user lands on `/`. The reload was unnecessary because auth state synchronization already happens in `AuthProvider` / `useAuth`; the page only needs to redirect to `/` when it is reached from another route. Added a regression test covering the authenticated-at-root case to ensure the component now stays put without a hard refresh.

- [x] **9.3 — Add lifecycle callbacks to `AuthProvider`** Hooks for important auth transitions would improve integration with host apps.

  > Add well-scoped callbacks such as `onTokenRefresh`, `onAuthError`, and `onSignOut`, with clear guarantees around when they fire and what data they receive. Avoid a generic event bus.
  >
  > Added `onTokenRefresh`, `onAuthError`, and `onSignOut` to `AuthProviderProps` with explicit event payload types in `src/types.ts` instead of a generic emitter. `onTokenRefresh` only fires when an already-loaded authenticated session receives a different access token; `onAuthError` reports both transient and definitive auth failures with a `willSignOut` flag; and `onSignOut` fires immediately before the provider initiates local or global sign-out, including the reason (`user`, `auth_error`, `missing_access_token`, `transient_error_limit`). Added focused context tests for refresh and sign-out/error flows and documented the callbacks in the public README.

- [x] **9.4 — Improve SSR/client boundary documentation and helpers** The package uses client-only guards in several places; consumers need clearer guidance.

  > Document supported SSR patterns, hydration expectations, and router integration examples for React Router and Next.js. Add small helper docs or examples before adding more runtime abstraction.
  >
  > Added an explicit `SSR And Router Boundaries` section to the main `README.md` describing the client-only surface (`AuthProvider`, `useAuth`, `SignInPage`, `CallbackPage`, `UserCenter`), hydration expectations, and the rule that backend authorization must come from `@ouim/simple-logto/backend` during SSR. Also added concrete React Router and Next.js App Router examples, plus matching backend-side guidance in `src/backend/README.md` so the frontend/server split is documented in both docs entrypoints.

- [ ] **9.5 — Add bundle-size monitoring in CI** This package ships UI and auth helpers; size regressions should be visible.

  > Add a lightweight size check or comparison job in CI so new dependencies or accidental bundling changes are caught early.

---

## Phase 10 — Authorization & Access Control

> These are useful, but they are feature expansion rather than core production-readiness blockers.

**Priority: 🟢 Low**

- [x] **10.1 — Add multi-scope authorization helpers** The current API only supports a single `requiredScope`.

  > Provide helpers such as `requireScopes(scopes, { mode: 'all' | 'any' })` without coupling them too tightly to Express or Next-specific middleware.
  >
  > Added framework-agnostic backend helpers in `src/backend/authorization.ts`: `hasScopes(subject, scopes, { mode })` for boolean checks and `requireScopes(subject, scopes, { mode })` for assertion-style guards. Both accept either a raw `AuthPayload` or a full `AuthContext`, normalize OAuth-style whitespace-delimited scope strings, and support `'all'` / `'any'` matching without changing existing middleware behavior. Exported them from the backend entrypoint, added focused unit coverage in `src/backend/authorization.test.ts`, and documented the pattern in both README surfaces.

- [x] **10.2 — Add role-based access control (RBAC) helpers** Roles are a common follow-on need once token verification is stable.

  > Add helpers like `hasRole` / `requireRole` against Logto role claims, with explicit docs about expected claim shape and tenant configuration assumptions.
  >
  > Extended `src/backend/authorization.ts` with `hasRole(subject, role, { claimKeys })` and `requireRole(subject, role, { claimKeys })`, keeping the API framework-agnostic and aligned with the scope helpers from 10.1. The helpers accept `AuthPayload` or `AuthContext`, read `roles` first and `role` second by default, and allow custom claim names for tenants that map roles into namespaced claims. Added focused unit tests for array claims, string claims, custom claim keys, and error cases, and documented the default claim-shape assumptions plus the custom-claim override path in both backend docs surfaces.

- [ ] **10.3 — Add a frontend permission helper** Conditional rendering against auth state should not require every consumer to re-parse permission data manually.

  > Consider a narrow `usePermission` hook only after the exact token/claim source is clear and stable in the frontend auth state.

- [ ] **10.4 — Add executable SSR integration fixtures for documented auth flows** The new SSR/router guidance is still documentation-only and could drift over time.

  > Add minimal fixture coverage for the documented React Router and/or Next.js SSR integration patterns so the examples are validated by CI instead of relying only on README maintenance.

---

## Phase 11 — Ecosystem & Community Polish

> Nice-to-haves for broader adoption after the release blockers and reliability gaps are handled.

**Priority: 🟢 Low**

- [ ] **11.1 — Add GitHub issue and PR templates** Improve contribution quality and reduce repetitive triage.

  > Add at least a bug report template, feature request template, and pull request template aligned with the repo’s release and testing expectations.

- [ ] **11.2 — Update Vite to a supported major version** The repo should not sit on stale build tooling longer than necessary.

  > Upgrade from Vite 4, run the full CI gate, and verify the generated library output and `bundler-config` helpers still behave correctly.

- [ ] **11.3 — Remove leftover repo artifacts** Source control should not keep irrelevant backup files.

  > Remove `.npmrc.backup` if it is no longer intentionally needed, and tighten `.gitignore` rules for editor or backup artifacts if needed.

- [ ] **11.4 — Add example applications** Real fixture apps improve adoption and reduce ambiguity in docs.

  > Add small examples for at least React + backend verification and Next.js integration. These can later double as smoke-test fixtures.

- [ ] **11.5 — Add migration and integration guides if adoption grows** These are useful once the core package stabilizes.

  > Candidates include migration from raw `@logto/react`, React Router integration, Next.js App Router integration, and guest-mode guidance. Do this after the base API and release process settle.
