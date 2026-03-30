# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install          # Install dependencies
npm run build        # Build: vite build + tsc --emitDeclarationOnly
npm run dev          # Watch TypeScript (no runnable demo app)
npm run clean        # Remove dist/
npm test             # Run vitest (watch mode)
npm run test:size    # Check published JS entrypoints against size budgets
npm run test:package # Audit packed tarball contents + README public imports
npm run test:smoke   # Pack dist/ and verify consumer fixtures install/build/import from the tarball
npm run lint         # ESLint
npm run lint:fix     # ESLint with auto-fix
```

Run a single test file:
```bash
npx vitest run src/useAuth.test.tsx
```

**Before every `git push`**, run the full local CI gate and confirm it passes:
```bash
npm run lint && npx tsc --project tsconfig.build.json --noEmit && npx vitest run && npm run build && npm run test:size && npm run test:package && npm run test:smoke
```
Do not push if any step fails. Fix the failure first.

> **Note:** CI uses `npm install` (not `npm ci`) because the lockfile is generated on Windows and only contains Windows-specific esbuild optional binaries. `npm install` respects the lockfile for pinned deps while resolving the correct platform binary on the Linux runner.

## Architecture

This is a **single npm package** (`@ouim/simple-logto`) with three published entrypoints:

| Entrypoint | Source | Purpose |
|---|---|---|
| `@ouim/simple-logto` | `src/index.ts` | React frontend (components, hooks, provider) |
| `@ouim/simple-logto/backend` | `src/backend/index.ts` | Node.js JWT verification (no DOM APIs) |
| `@ouim/simple-logto/bundler-config` | `src/bundler-config.ts` | Vite/Webpack/Next.js config helpers |

### Frontend (`src/`)

- `context.tsx` — `AuthProvider`: wraps `@logto/react`, manages token refresh, syncs cookie for backend verification
- `useAuth.ts` — `useAuth`: user state, auth actions, route protection middleware
- `user-center.tsx` — `UserCenter`: Radix UI-based account dropdown component
- `callback.tsx` — `CallbackPage`: handles both redirect and popup callback flows
- `signin.tsx` — `SignInPage` and sign-in initiation
- `types.ts` — shared frontend types
- `utils.ts` — cookie and JWT cookie utilities
- `components/ui/` — Radix UI primitives (avatar, dialog, dropdown, tooltip)

### Backend (`src/backend/`)

- `verify-auth.ts` — core JWT verification via `jose` and Logto JWKS endpoint (with caching)
- `index.ts` — exports `verifyAuth`, `verifyNextAuth`, `createExpressAuthMiddleware`
- Token lookup order: cookie (`logto_authtoken`) → `Authorization: Bearer` header

### Key Dependencies

- `@logto/react` (peer): core Logto SDK
- `jose`: JWT verification / JWKS fetching
- `@fingerprintjs/fingerprintjs`: guest mode fingerprint IDs
- Radix UI components + `tailwind-merge`/`clsx` for UI

## Conventions

- All new frontend exports must be re-exported from `src/index.ts`
- Backend code must not use DOM APIs
- TypeScript strict mode is enforced (`noUnusedLocals`, etc.)
- Tests use `vitest` + `happy-dom` + `@testing-library/react`; setup in `vitest.setup.ts`
- The `exports` field in `package.json` controls CJS/ESM dual output — don't add new entrypoints without updating it
