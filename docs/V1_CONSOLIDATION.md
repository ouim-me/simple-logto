# AuthKit v1 consolidation

AuthKit is the authoritative package. The temporary `@ouim/identity` repository is a feature donor, not a runtime dependency and not a second library consumers must install.

## Runtime boundary

Normal applications install one package and communicate directly with Logto. The optional portal is only a compatible privileged backend for organization administration, account deletion, operator workflows, and other Management API operations.

The package contains no portal URL, tenant configuration, Management API credential, or product-specific branding.

## Donor mapping

| Donor capability | AuthKit destination | Decision |
| --- | --- | --- |
| Popup/direct social flow | `src/flow.ts`, `src/context.tsx`, callback/sign-in routes | Rewritten into AuthKit’s mature state machine |
| Custom sign-in UI | `src/auth-primitives.tsx`, `src/styles/authkit.css` | Ported with generic naming and no default product logo |
| Account API | `src/account.ts`, `src/account-center.tsx` | Ported as direct user-token operations; privileged deletion is adapter-only |
| Organizations | `src/organization.tsx` | Ported as an optional backend contract with no default endpoint |
| Server verification | Existing `src/server/` | Donor verifier rejected; AuthKit’s tested verifier remains authoritative |
| Encrypted sessions | `src/server/session.ts` | Added as an optional server-only entrypoint |
| Ouim-specific APIs and copy | None | Excluded |

## Compatibility guarantees

- Existing `AuthProvider`, `useAuth`, `UserCenter`, `SignInPage`, `CallbackPage`, and string/boolean `signIn` integrations remain supported.
- Guest identity, refresh recovery, Express, Next.js, cookie and bearer verification, CJS, ESM, and bundler helpers retain their existing implementations and tests.
- Enhanced provider selection is additive through `openSignIn(options)`, `SignInDialog`, and the object overload of `signIn`.
- Optional features are subpath exports so legacy consumers do not pay their full bundle cost.

## Release gate

The v1 beta is ready only after lint, strict typecheck, all unit/integration tests, dual builds, size budgets, package audit, packed smoke fixtures, blank-project imports, and a real application popup/session regression pass succeed.
