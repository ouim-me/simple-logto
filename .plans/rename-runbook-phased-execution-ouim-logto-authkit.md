# Phased Execution Plan: `@ouim/simple-logto` -> `@ouim/logto-authkit`

## Purpose

This document breaks the rename runbook into execution phases for an AI assistant that will drive the work. The goal is to keep the rename operationally safe while preserving the current package behavior.

This is a hard-cut major rename:

- package: `@ouim/simple-logto` -> `@ouim/logto-authkit`
- server subpath: `@ouim/simple-logto/backend` -> `@ouim/logto-authkit/server`
- bundler subpath: `@ouim/simple-logto/bundler-config` -> `@ouim/logto-authkit/bundler-config`
- internal source layout: `src/backend/` -> `src/server/`

There is no compatibility shim package and no `./backend` alias in the renamed package.

## Repo Context Confirmed

The assistant should assume these are real codebase constraints, not generic rename assumptions:

- `package.json` currently publishes `@ouim/simple-logto` with exports for `.`, `./backend`, and `./bundler-config`.
- Root exports come from `src/index.ts`.
- Server exports currently come from `src/backend/index.ts`.
- Packed package validation is enforced by `scripts/run-package-audit.mjs`, which scans `package.json` exports and README code fences.
- Packed smoke validation is enforced by `scripts/run-packed-smoke-tests.mjs`, which installs the packed tarball into fixtures under `smoke-fixtures/`.
- CI and publish workflows run lint, type-check, tests, build, bundle-size, and package-audit from GitHub Actions.
- The repo currently contains many hard-coded references to `@ouim/simple-logto`, `src/backend`, and `simple-logto` across `README.md`, `docs/`, `example_app/`, `examples/`, `smoke-fixtures/`, scripts, and comments.

## Execution Model

Use separate phases with clear stop points. Do not combine the final old-package messaging release, the rename refactor, and the GitHub repository rename into one change set.

Recommended release/branch model:

1. One branch/PR for the final old-package messaging release.
2. One branch/PR for the actual package rename and `/server` migration.
3. No PR for npm deprecation itself; do that as a registry action after the new package is live.
4. One later branch/PR for the GitHub repository rename fallout, after npm is stable.

Recommended tag/release model:

1. Merge the old-package messaging PR first and tag `v0.2.1`.
2. Create the `v0.2.1` GitHub release as a draft. Do not publish it yet.
3. Merge the rename PR second and tag `v0.3.0`.
4. Publish the `v0.3.0` GitHub release first so `@ouim/logto-authkit` reaches npm first.
5. Confirm the new package is live.
6. Publish the drafted `v0.2.1` release if the final old-name release should also go to npm.
7. Deprecate `@ouim/simple-logto` after the new package is confirmed live.

## Phase 0: Preflight And Guardrails

### Goal

Verify ownership, release sequencing, and naming constraints before touching code.

### Inputs

- [package.json](G:\simple-logto\package.json)
- [README.md](G:\simple-logto\README.md)
- [scripts/run-package-audit.mjs](G:\simple-logto\scripts\run-package-audit.mjs)
- [scripts/run-packed-smoke-tests.mjs](G:\simple-logto\scripts\run-packed-smoke-tests.mjs)
- [ci.yml](G:\simple-logto\.github\workflows\ci.yml)
- [publish.yml](G:\simple-logto\.github\workflows\publish.yml)

### Actions

- Re-confirm `@ouim/logto-authkit` is available on npm immediately before the rename work starts.
- Confirm the `@ouim` scope can publish the new package name.
- Confirm npm provenance/publish permissions still apply for the renamed package.
- Decide the major version strategy for the new package release.
- Decide whether release notes/issues/discussions will be published from GitHub Releases, Discussions, or both.

### Output

- A short preflight note in the working issue/PR description with:
  - npm name availability confirmed
  - scope publish access confirmed
  - major version target confirmed
  - release order confirmed

### Branch / PR

- No code branch required if this is just validation.
- If you need a tracked artifact, use a small planning issue instead of a PR.

## Phase 1: Final Old-Package Messaging Release

### Goal

Ship one last release under `@ouim/simple-logto` that warns users about the move before the cold cut.

### Why This Is Separate

This release should not contain the actual rename. It exists to reduce surprise for existing users and to keep the release diff low-risk.

### Branch

- Recommended branch: `prep/final-simple-logto-release`

### PR

- Recommended PR title: `chore: add migration notice before package rename`

### Code And Docs Scope

- Add a prominent migration/deprecation notice at the top of [README.md](G:\simple-logto\README.md).
- Add a changelog entry in [CHANGELOG.md](G:\simple-logto\CHANGELOG.md) announcing:
  - package moves to `@ouim/logto-authkit`
  - `/backend` becomes `/server`
  - there will be no compatibility shim
- Update key contributor/release docs that explain the upcoming switch without yet changing active install/import instructions everywhere.
- Optionally add low-noise development warnings only if they are trivial and safe. Avoid runtime behavior changes.

### Required Message To Standardize

Use the same mapping everywhere:

- `npm install @ouim/simple-logto` -> `npm install @ouim/logto-authkit`
- `from '@ouim/simple-logto'` -> `from '@ouim/logto-authkit'`
- `from '@ouim/simple-logto/backend'` -> `from '@ouim/logto-authkit/server'`
- `from '@ouim/simple-logto/bundler-config'` -> `from '@ouim/logto-authkit/bundler-config'`

### Validation

Run the normal local gate before merge:

- `npm run lint`
- `npx tsc --project tsconfig.build.json --noEmit`
- `npx vitest run`
- `npm run build`
- `npm run test:size`
- `npm run test:package`
- `npm run test:smoke`

### Publish

- Merge this PR first.
- Tag `v0.2.1`.
- Create the `v0.2.1` GitHub release as a draft.
- Do not publish that release yet.
- Do not deprecate `@ouim/simple-logto` yet. Deprecation happens only after the new package is live.

### Exit Criteria

- `v0.2.1` code is merged and tagged.
- `v0.2.1` release draft exists and is ready.
- README/changelog messaging is public in the repo.
- Users can see the exact replacement package and import-path mapping.

## Phase 2: Main Rename Refactor In Repo

### Goal

Convert the codebase and published package metadata from `simple-logto` / `/backend` to `logto-authkit` / `/server`.

### Branch

- Recommended branch: `feat/rename-to-logto-authkit`

### PR

- Recommended PR title: `feat!: rename package to @ouim/logto-authkit and backend subpath to /server`

### Must-Change Areas

#### Package metadata

- [package.json](G:\simple-logto\package.json)
  - change `name`
  - change `description` if needed
  - replace `./backend` export with `./server`
  - keep `./bundler-config`
  - leave repository URL pointing at the current repo until the GitHub rename actually happens
- `package-lock.json`
- any scripts/tests/docs that assert tarball names, public import names, or export keys

#### Source layout

- rename `src/backend/` -> `src/server/`
- update internal imports and relative paths
- update entrypoint pathing so the published dist becomes `dist/server/...`
- remove any active dependency on `src/backend` paths

#### Public docs and examples

Update active consumer-facing references in:

- [README.md](G:\simple-logto\README.md)
- [AGENTS.md](G:\simple-logto\AGENTS.md)
- [CONTRIBUTING.md](G:\simple-logto\CONTRIBUTING.md)
- [SECURITY.md](G:\simple-logto\SECURITY.md)
- [docs](G:\simple-logto\docs)
- [example_app](G:\simple-logto\example_app)
- [examples](G:\simple-logto\examples)
- [smoke-fixtures](G:\simple-logto\smoke-fixtures)

#### Validation-sensitive code/comments

Do not miss these classes of references:

- README code fences scanned by `scripts/run-package-audit.mjs`
- tarball placeholder usage in `smoke-fixtures/*/package.json`
- example-app aliases mapping to `../src/backend/index.ts`
- inline code comments and JSDoc examples in `src/server/*` and `src/bundler-config.ts`
- warning/log prefixes like `[simple-logto]`
- docs links to `src/backend/README.md`

### Important Constraint

Do not mix unrelated feature work into this PR. The rename already touches package identity, exports, smoke fixtures, and docs at the same time.

### Validation

Run the full local gate:

- `npm run lint`
- `npx tsc --project tsconfig.build.json --noEmit`
- `npx vitest run`
- `npm run build`
- `npm run test:size`
- `npm run test:package`
- `npm run test:smoke`

Then perform explicit rename checks:

- no active `./backend` export remains in `package.json`
- no active imports remain for `@ouim/simple-logto/backend`
- no active imports remain for `@ouim/simple-logto` except intentional migration notes
- `dist/server` artifacts exist after build
- smoke fixtures succeed using `@ouim/logto-authkit/server`
- package audit passes with renamed README imports

### Exit Criteria

- PR merged.
- Default branch contains the full rename.
- Local and CI validation are green.

## Phase 3: Publish The New Canonical Package

### Goal

Publish `@ouim/logto-authkit` as the new official package.

### Branch / PR

- No new code branch if Phase 2 already merged cleanly.
- Publish from the merged rename commit/tag.

### Registry Actions

- Re-check npm availability for `@ouim/logto-authkit` immediately before publish.
- Publish the `v0.3.0` GitHub release first.
- Let `publish.yml` publish `@ouim/logto-authkit`.
- Verify registry metadata:
  - `npm view @ouim/logto-authkit`
  - install in a clean temp project
  - root import works
  - `/server` import works
  - `/bundler-config` import works
- If the final old-name release should also ship, publish the drafted `v0.2.1` release only after the new package is confirmed live.

### GitHub Ecosystem Actions

- Create a GitHub release for the major rename.
- Release notes must include:
  - old package name
  - new package name
  - old `/backend` path
  - new `/server` path
  - clear install/import replacements
- If the repo uses pinned issues/discussions for migrations, publish one now.

### npm Ecosystem Actions

- Confirm the new package page resolves and shows the correct README/package metadata.
- Confirm provenance and installability work under the new name.

### Exit Criteria

- `@ouim/logto-authkit` is live and installable.
- Public release note exists with the exact migration mapping.

## Phase 4: Deprecate The Old Package On npm

### Goal

Deprecate `@ouim/simple-logto` only after the new package is confirmed live.

### Branch / PR

- None. This is an npm registry action.

### Action

Deprecate the old package with a precise message:

`Package moved to @ouim/logto-authkit. Replace @ouim/simple-logto with @ouim/logto-authkit and change /backend imports to /server.`

### Notes

- Do not create a shim package.
- Do not deprecate before Phase 3 succeeds.

### Exit Criteria

- `npm deprecate` is applied.
- npm users see both the package rename and the `/backend` -> `/server` mapping.

## Phase 5: GitHub Repository Rename Follow-Up

### Goal

Rename the GitHub repository only after npm/package migration is stable.

### Why This Is Deferred

The package rename already changes install strings, docs, export paths, tarball behavior, and release notes. Renaming the repository at the same time adds unnecessary link churn.

### Branch

- Recommended branch: `chore/rename-repo-followup`

### PR

- Recommended PR title: `chore: update repository metadata after GitHub repo rename`

### External GitHub Action

- Rename repo from `simple-logto` to `logto-authkit` in GitHub settings.

### Repo Changes After Rename

Update all fallout from the repo rename:

- `repository.url` in [package.json](G:\simple-logto\package.json)
- README badges and links
- changelog compare/release links
- docs links
- clone URLs in contributor docs
- any release docs or workflows that mention the old repo slug

### Verification

- old GitHub URLs redirect
- npm package page points to the renamed repository
- release links and compare links still resolve

### Exit Criteria

- Repository rename is complete.
- Metadata/docs no longer point to the old slug except where historical context is intentional.

## Cross-Phase Checklist For The Assistant

- Keep migration notes explicit when old names are mentioned; otherwise update active references to the new names.
- Treat `README.md`, `docs/`, examples, smoke fixtures, and scripts as part of the public API surface because the package audit and smoke tests effectively enforce them.
- Preserve behavior. The only intentional break is naming.
- Do not change the `/bundler-config` subpath name.
- Do not publish or deprecate based only on local assumptions; re-check npm state at the moment of action.
- Do not update `repository.url` until the GitHub repository is actually renamed.

## Deliverables By Phase

- Phase 1: final old-package warning release
- Phase 2: merged rename PR with code/docs/tests/fixtures updated
- Phase 3: published `@ouim/logto-authkit` release and GitHub release notes
- Phase 4: deprecated `@ouim/simple-logto` on npm
- Phase 5: repository rename follow-up PR and metadata cleanup

## Suggested Tracking Items

If you want this delegated cleanly to a personal assistant AI, create one tracking issue with these subtasks:

1. Preflight npm/package ownership check
2. Final old-package messaging release
3. Rename PR for package and `/server`
4. New package publish and release notes
5. npm deprecation of old package
6. GitHub repository rename follow-up

That gives the assistant a stable execution order and makes it harder to accidentally collapse ecosystem changes into the code rename PR.
