# AGENTS.md

## Purpose

`@ouim/logto-authkit` is the public, reusable SDK around Logto. It provides React authentication, branded sign-in primitives, account and organization clients/UI, backend JWT verification, encrypted application sessions, CSRF/authorization helpers, and bundler helpers.

The package must work directly with a consumer's Logto tenant. It does **not** depend on the Ouim Identity Portal. Portal-specific Management API credentials, operator rules, migrations, and tenant metadata do not belong here.

Current package version: `1.0.0-beta.3`.

## Published entrypoints

| Import | Source | Purpose |
| --- | --- | --- |
| `@ouim/logto-authkit` | `src/index.ts` | `AuthProvider`, hooks, popup flow, auth primitives, `UserCenter` |
| `@ouim/logto-authkit/account` | `src/account-entry.ts` | Account API client and account-center panels |
| `@ouim/logto-authkit/organization` | `src/organization-entry.ts` | Adapter-driven organizations and switcher |
| `@ouim/logto-authkit/server` | `src/server/index.ts` | JWT verification, Express/Next helpers, scopes, roles, CSRF |
| `@ouim/logto-authkit/server/session` | `src/server/session.ts` | Encrypted HttpOnly application-session helpers |
| `@ouim/logto-authkit/bundler-config` | `src/bundler-config.ts` | Vite/Webpack/Next configuration helpers |
| `@ouim/logto-authkit/styles.css` | built from `src/styles/` | Styles for shipped UI |

Any public API change must update the relevant entrypoint, types, tests, README, package audit, and consumer fixtures.

## Runtime model

### Browser authentication

`src/context.tsx` is the runtime center. `AuthProvider` wraps `@logto/react` and owns:

- user/loading/error state;
- resource-aware access-token retrieval;
- serialized token synchronization and refresh;
- popup/redirect sign-in policies;
- local versus global sign-out;
- optional token-cookie synchronization;
- optional exchange into a server-managed session through `sessionEndpoint`.

The popup flow spans:

1. `src/auth-primitives.tsx` / `src/flow.ts`: app-owned sign-in dialog and flow parameters;
2. `src/signin.tsx`: popup route starts Logto without recursively opening another popup;
3. `src/callback.tsx`: completes callback, correlates the flow, notifies the opener, and closes;
4. `src/context.tsx`: validates origin/flow ID, remounts Logto state, and performs one token sync.

Do not change one part of this flow in isolation. Preserve random flow IDs, exact-origin checks, safe return paths, popup-blocked/closed/timeout handling, and `prompt=login consent` when explicit sign-in also requests `offline_access`.

### UI

- `src/user-center.tsx`: canonical account dropdown; defaults to local sign-out unless `globalSignOut` is set.
- `src/auth-primitives.tsx`: sign-in dialog, signed-in/out states, `Protect`, and profile primitive.
- `src/account-center.tsx`: reusable Account API panels.
- `src/organization.tsx`: organization provider, adapter client, profile, and switcher.
- `src/components/ui/dropdown-menu.tsx`: shared Shadcn/Base UI menu used by `UserCenter` and `OrganizationSwitcher`.

Use Shadcn/Base UI for dropdown menus. Do not reintroduce direct Radix dropdown imports or hand-built menus. Other legacy primitives may still use Radix; migrate them deliberately rather than mixing implementations inside one interaction.

### Account and organization boundaries

`src/account.ts` calls Logto's Account API with the signed-in user's Account API token. Most self-service profile/security features therefore work without a portal.

`src/organization.tsx` is adapter-driven. Organization Management API mutations require a trusted backend; the SDK must never embed an M2M secret or default to an Ouim URL.

### Server authentication

`src/server/verify-auth.ts` is authoritative for JWT verification:

- explicit `Authorization: Bearer` credentials take precedence over ambient cookies;
- cookie fallback defaults to `logto_authtoken`;
- issuer, audience, signature, time, and requested scopes are verified with `jose`;
- JWKS caching retries once after key rotation;
- guest fallback is opt-in.

Client-side `usePermission`/`Protect` only control presentation. Protected data and mutations must be authorized again on the server.

`src/server/session.ts` seals an access token into an A256GCM JWE and can hydrate it back into an Authorization header. Keep the encrypted session cookie separate from raw access-token cookies. Session secrets must contain at least 32 characters; rotation uses the ordered `secrets` fallback list.

## High-signal file map

- Auth state, refresh, cookies, popup recovery: `src/context.tsx`
- Sign-in parameters and safety: `src/flow.ts`
- Popup routes: `src/signin.tsx`, `src/callback.tsx`
- Public hooks and router integration: `src/useAuth.ts`, `src/navigation.tsx`
- Presentation authorization: `src/usePermission.ts`, `src/auth-primitives.tsx`
- User menu: `src/user-center.tsx`
- Account API/UI: `src/account.ts`, `src/account-center.tsx`
- Organizations: `src/organization.tsx`
- Server verification: `src/server/verify-auth.ts`
- Server authorization/CSRF/session: `src/server/authorization.ts`, `src/server/csrf.ts`, `src/server/session.ts`
- Public types: `src/types.ts`, `src/server/types.ts`
- Build/export map: `vite.config.js`, `package.json`
- Package validation: `scripts/`
- Consumer compatibility: `smoke-fixtures/`

`smoke-fixtures/next-app-router` is a disposable package-compatibility fixture, not part of any consuming Vite application. `scripts/run-packed-smoke-tests.mjs` copies fixtures under ignored `.tmp/packed-smoke`, installs the packed tarball, and deletes/recreates that area on the next run.

## Commands and required release gate

```bash
npm install
npm run lint
npm run typecheck
npm test -- --run
npm run build
npm run test:size
npm run test:package
npm run test:smoke
npm audit --omit=dev
```

Before publishing, all commands above must pass. `test:smoke` requires a current `dist/`, takes several minutes, and validates Vite, React Router, React 17, Next App Router, Node ESM/CJS, and bundler-config consumers.

CI uses `npm install` on Node 24 because the Windows-generated lockfile may omit Linux optional binaries required by `npm ci`.

## Release workflow

- CI: `.github/workflows/ci.yml`
- npm publication: `.github/workflows/publish.yml`
- Publishing a GitHub release reruns lint, typecheck, tests, build, size, and package audit before trusted npm publication. Packed smoke tests remain a required local pre-release gate.
- Prerelease versions publish under npm's `next` tag; stable versions publish as `latest`.
- The package script is `release:npm`; do not name a script `publish`, which collides with npm lifecycle behavior.
- Never overwrite or move an existing release tag.

## Non-negotiable constraints

- Keep the main frontend entrypoint browser-oriented and marked `'use client'`.
- Keep backend entrypoints free of DOM/browser dependencies.
- Preserve ESM and CommonJS output for every exported entrypoint.
- Support React 17/18/19 and `@logto/react` 3/4 as declared in peer dependencies.
- Never ship tenant secrets, M2M credentials, internal portal URLs, operator IDs, or real user data.
- Do not make security depend on source secrecy; the package is public.
- A browser-written token cookie cannot be HttpOnly. Prefer `sessionEndpoint` plus `server/session` for higher-security deployments.
- Preserve guest behavior when touching cookies or verification.
- Existing consumer APIs require a compatibility path; additive changes are preferred during the beta.

## Change checklist

1. Trace the active entrypoint and related runtime path before editing.
2. Add regression coverage near the changed module.
3. Update README/types/exports when the consumer contract changes.
4. Run the full release gate, including packed smoke tests.
5. Inspect `npm pack --dry-run` or rely on `test:package`; only compiled distribution files may ship.
