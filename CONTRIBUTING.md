# Contributing to `@ouim/simple-logto`

Thank you for your interest in contributing! This document covers everything you need to get started.

---

## Table of Contents

1. [Local Development Setup](#local-development-setup)
2. [Running Tests](#running-tests)
3. [Commit Message Conventions](#commit-message-conventions)
4. [Pull Request Process](#pull-request-process)
5. [Branch Protection Rules](#branch-protection-rules)
6. [Publishing a Release](#publishing-a-release)

---

## Local Development Setup

**Requirements:** Node.js ≥ 18, npm ≥ 9.

```bash
# 1. Fork and clone the repo
git clone https://github.com/ouim-me/simple-logto.git
cd simple-logto

# 2. Install dependencies (also installs husky git hooks via the prepare script)
npm install

# 3. Watch TypeScript for errors during development
npm run dev
```

The library has **no runnable demo application**. To test changes end-to-end, integrate the package into a consuming project using `npm link` or `file:` imports.

---

## Running Tests

```bash
npm test                                       # vitest in watch mode (local dev)
npx vitest run                                 # single pass — same as CI
npx vitest run src/useAuth.test.tsx            # run a single file
npm run lint                                   # ESLint check
npm run lint:fix                               # ESLint with auto-fix
npx tsc --project tsconfig.build.json --noEmit # type-check without emitting files
npm run build                                  # full library build (vite + tsc)
```

> **Coverage:** `npm run test:coverage` requires `@vitest/coverage-v8` — install it first with `npm install --save-dev @vitest/coverage-v8` if you need a coverage report locally.

All tests must pass and the build must succeed before a PR can be merged.

---

## Commit Message Conventions

This project follows **[Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/)**.

```
<type>(<scope>): <short description>

[optional body]

[optional footer(s)]
```

**Common types:**

| Type | When to use |
|------|-------------|
| `feat` | New feature or behaviour visible to consumers |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `refactor` | Code change with no behaviour change |
| `test` | Adding or fixing tests |
| `chore` | Tooling, dependencies, CI |
| `ci` | CI/CD workflow changes |
| `perf` | Performance improvements |

**Scopes** (optional, but recommended) — see `commitlint.config.js` for the full enforced list. Common ones: `auth`, `backend`, `csrf`, `ui`, `types`, `deps`, `ci`, `release`, `docs`, `config`, `hooks`, `utils`, `context`, `callback`, `user-center`.

**Breaking changes:** append `!` after the type/scope, e.g. `feat(backend)!: change verifyAuth signature`, and add a `BREAKING CHANGE:` footer.

`commitlint` + `husky` hooks enforce this format automatically. The `commit-msg` hook runs `commitlint` on every commit. Hooks are installed automatically by `npm install` via the `prepare` script — no manual setup needed.

---

## Pull Request Process

1. **Branch off `rc`** — `master` receives merges only from `rc` at release time.
   ```bash
   git checkout rc
   git pull origin rc
   git checkout -b feat/my-feature
   ```
2. **Write tests** for any new functionality or bug fix.
3. **Run the full local CI gate** before pushing:
   ```bash
   npm run lint && npx tsc --project tsconfig.build.json --noEmit && npx vitest run && npm run build
   ```
4. **Open a PR against `rc`** — not `master`.
5. Ensure the GitHub Actions **CI** workflow passes (the single `Lint · Type-check · Test · Build` job on Node 24 must be green).
6. Request a review from a maintainer. At least **one approval** is required before merge.
7. PRs are merged with **Squash and Merge** to keep a clean linear history on `rc`.

---

## Branch Protection Rules

The following rules are enforced in GitHub repository settings (Settings → Branches):

### `master`

| Rule | Setting |
|------|---------|
| Require a pull request before merging | ✅ Enabled |
| Required approvals | 1 |
| Require status checks to pass | ✅ CI (`Lint · Type-check · Test · Build`) |
| Require branches to be up to date before merging | ✅ Enabled |
| Restrict who can push directly | Maintainers only |
| Allow force pushes | ❌ Disabled |
| Allow deletions | ❌ Disabled |

### `rc` (release candidate)

| Rule | Setting |
|------|---------|
| Require a pull request before merging | ✅ Enabled |
| Required approvals | 1 |
| Require status checks to pass | ✅ CI (`Lint · Type-check · Test · Build`) |
| Allow force pushes | ❌ Disabled |

> **For maintainers:** These rules must be configured in the GitHub UI (or via the GitHub API / Terraform). They cannot be enforced from within the repository itself.

---

## Publishing a Release

Releases are automated via the `publish.yml` GitHub Actions workflow. To cut a new release:

1. **Update `CHANGELOG.md`** — add an entry for the new version using the format in that file.
2. **Bump the version** in `package.json` and commit it to `rc`:
   ```bash
   npm version patch   # or minor / major
   git push origin rc --follow-tags
   ```
3. **Merge `rc` → `master`** via a PR using **Merge Commit** (not squash) so the version-bump commit and its tag remain reachable from `master`'s history.
4. **Create a GitHub Release** from the version tag on `master` — the publish workflow triggers automatically, runs the full CI gate, then publishes to npm with provenance attestation.

> **Note:** Use **Merge Commit** (not Squash) for the `rc → master` release PR. A squash creates a new commit that does not contain the tagged commit, making the tag an orphan from `master`'s perspective. Day-to-day feature PRs into `rc` should still use Squash and Merge.

> The npm token must be stored as `NPM_TOKEN` in the repository's GitHub Secrets (Settings → Secrets and variables → Actions).
