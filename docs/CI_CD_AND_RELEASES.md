# CI/CD & Release Process

This document describes the GitHub Actions workflows, smoke tests, and release process for `@ouim/simple-logto`.

## Overview

The repository uses GitHub Actions for:

- **Validation:** Lint, type-check, test, and build on every pull request
- **Release:** Automated npm publishing with build artifact verification
- **Monitoring:** Package size tracking and security audits

---

## Validation Workflow (`.github/workflows/ci.yml`)

Runs on every pull request and merge to `main`/`master`:

```
Lint → Type Check → Test → Build
```

### What It Does

1. **Lint** (`eslint` / `biome`)
   - Checks code style and common errors
   - Reports violations but doesn't block

2. **Type Check** (`tsc`)
   - Ensures TypeScript types are correct
   - Catches type errors before tests run

3. **Test** (`vitest`)
   - Runs all unit and integration tests
   - Requires 100% pass rate

4. **Build** (`npm run build`)
   - Creates production bundles (ESM + CommonJS)
   - Validates bundler config helpers
   - Checks tree-shaking and unused code

### Node.js Version

Runs on **Node 24** (current Active LTS as of March 2026).

The `engines` field in `package.json` declares broader support (`18.18+`, `20.x`, `22.x`, `24.x`), but CI stays intentionally lean with a single stable LTS version.

### Running Locally

Replicate the CI workflow:

```bash
npm run lint      # Lint check
npm run type-check # TypeScript check
npm run test      # Unit tests
npm run build     # Production build
```

Or run the full suite:

```bash
npm run validate  # All of the above
```

---

## Smoke Tests

Located in `smoke-fixtures/`, these validate the package works in real-world scenarios.

### What's Tested

Each fixture simulates a complete integration:

1. **Vite + React** (`vite-react/`)
   - Frontend-only setup
   - Bundler config helpers
   - ESM module resolution

2. **React Router** (`react-router/`)
   - Client-side routing with `useNavigate`
   - Custom `customNavigate` prop

3. **Next.js App Router** (`next-app-router/`)
   - React Server Components
   - API route with `verifyNextAuth`
   - Cookie-based auth

4. **Node.js Backend** (`node-backend/`)
   - `verifyAuth` helper
   - Express.js middleware
   - JWKS verification

5. **Bundler Config** (`bundler-config/`)
   - CommonJS imports
   - ESM imports
   - Webpack, Vite, and Next.js configs

### Running Smoke Tests Locally

```bash
npm run test:smoke
```

Or test a specific fixture:

```bash
cd smoke-fixtures/vite-react
npm install
npm run dev

# In another terminal
npm run test
```

### What Gets Validated

- Package installation
- Import resolution (both ESM and CommonJS)
- Type correctness
- Bundler compatibility
- Runtime behavior

If a smoke test fails, it means the package broke in a real-world context (not just internal unit tests).

---

## Package Audit Workflow

Located in `.github/workflows/publish.yml`, this runs on release:

```bash
npm audit --audit-level=moderate
```

Ensures no unpatched high-severity vulnerabilities are shipped.

### If Audit Fails

The publish workflow blocks until vulnerabilities are resolved. Options:

1. Patch the vulnerable dependency
2. Wait for the vulnerability to be patched upstream
3. Suppress (if it's a false positive or development-only dependency)

---

## Release Workflow (`.github/workflows/publish.yml`)

Automatically publishes to npm when a GitHub release is published.

### How It Works

1. **Trigger:** Publish a GitHub Release
2. **Validate:** Run full CI (lint, test, build)
3. **Audit:** Check for security vulnerabilities
4. **Publish:** Push to npm with build provenance
5. **Verify:** Validate the published artifact

### Release Steps

1. **Update version in `package.json`:**

```json
{
  "version": "0.1.9"
}
```

2. **Update `CHANGELOG.md`:**

```markdown
## [0.1.9] — 2026-03-30

### Added
- Feature X
- Feature Y

### Fixed
- Bug fix A

### Security
- Security improvement

[0.1.9]: https://github.com/ouim-me/simple-logto/compare/v0.1.8...v0.1.9
```

3. **Create a GitHub Release:**
   - Go to **Releases** → **Create a new release**
   - Tag: `v0.1.9`
   - Title: `v0.1.9 — Description`
   - Copy CHANGELOG entries into the description
   - Save as draft if you do not want npm publication yet
   - Click **Publish release** only when you want the npm publish workflow to run

4. **Workflow runs:**
   - Validates the code
   - Publishes to npm
   - Archives build artifacts as GitHub release assets

### Rename-Specific Release Order

For the `@ouim/simple-logto` -> `@ouim/logto-authkit` transition:

1. Merge the final old-name messaging PR.
2. Tag `v0.2.1`.
3. Create `v0.2.1` as a draft GitHub release.
4. Merge the rename PR.
5. Tag `v0.3.0`.
6. Publish the `v0.3.0` release first so `@ouim/logto-authkit` reaches npm first.
7. Verify the new package is live.
8. Publish `v0.2.1` only after that if the final old-name line should also be shipped.
9. Deprecate `@ouim/simple-logto` on npm after the new package is confirmed live.

### Build Provenance

The npm publish includes **build provenance** (SLSA Level 3), proving:

- The package was built from the exact commit in GitHub
- The build ran in a managed GitHub Actions environment
- No tampering occurred between build and publish

Consumers can verify this with:

```bash
npm audit signatures
```

---

## Bundle Size Monitoring

The `check-bundle-size.mjs` script monitors package size:

```bash
npm run check-bundle-size
```

Reports:

- Main entrypoint size (gzipped + uncompressed)
- `/backend` entrypoint size
- `/bundler-config` entrypoint size
- Tree-shaking effectiveness

### Size Budget

Rough targets (not hard limits):

- Main: < 50 KB gzipped
- `/backend`: < 20 KB gzipped
- `/bundler-config`: < 10 KB gzipped

If a change significantly increases size, consider:
- Code-splitting
- Removing unused dependencies
- Using lighter alternatives

---

## Branch Protection

The `master`/`main` branch has protection rules:

1. **All checks must pass:**
   - CI workflow (lint, test, build)
   - Code review (if required)
   - Status checks (any branch coverage tools)

2. **No force push** — prevents accidental history rewriting

3. **Merge commits only** — keeps a clean, linear history

---

## Local Development & Testing

### Install Dependencies

```bash
npm install
```

### Run Linter

```bash
npm run lint
npm run lint:fix  # Auto-fix
```

### Type Check

```bash
npm run type-check
```

### Test

```bash
npm run test              # Run all tests
npm run test:watch       # Watch mode
npm run test:ui          # Interactive UI
npm run test:coverage    # Coverage report
```

### Build

```bash
npm run build             # ESM + CommonJS bundles
npm run build:check       # Validate bundle size
```

### Full Validation

```bash
npm run validate          # Lint → Type-check → Test → Build
```

---

## Troubleshooting

### CI Fails Locally but Passes on My Machine

- **Node version:** Make sure you're using Node 18.18+ (CI uses Node 24)
- **Dependencies:** Run `npm ci` instead of `npm install` for exact versions
- **Cache:** Clear `node_modules` and reinstall: `rm -rf node_modules && npm ci`
- **OS differences:** Windows vs. macOS path handling — use `cross-platform` scripts

### Smoke Test Fails

1. Check the specific fixture's README
2. Ensure the fixture's `package.json` uses the local package:
   ```json
   {
     "dependencies": {
       "@ouim/simple-logto": "file:../../"
     }
   }
   ```
3. Re-install: `cd smoke-fixtures/vite-react && rm -rf node_modules && npm install`
4. Run in isolation: `npm test` in that fixture directory

### Bundle Size Check Fails

1. Run `npm run check-bundle-size` locally
2. Check what changed: `git diff` for dependency additions or large code changes
3. Consider code-splitting or removing unused exports

### Publish Fails

Check the `publish.yml` workflow logs:

1. Did the CI validation pass?
2. Did the audit pass? (Check `npm audit`)
3. Does the package.json version match the GitHub Release tag?
4. Are there uncommitted changes?

---

## Continuous Integration Environment

### GitHub Actions Runners

- **OS:** Ubuntu Latest (Linux)
- **Node:** 24.x (Active LTS)
- **npm:** Latest bundled with Node

### Environment Variables

None required for public builds. For future private registries, secrets can be configured in GitHub repository settings.

### Build Artifacts

Published to npm and archived in GitHub Releases as:

- `simple-logto-v0.1.9.tgz` (packed tarball)
- ESM/CommonJS bundles
- TypeScript type definitions

---

## Release Checklist

Before creating a release:

- [ ] All tests pass locally (`npm run validate`)
- [ ] `CHANGELOG.md` is updated
- [ ] `package.json` version matches planned release
- [ ] Examples still work with the new version
- [ ] Security audit passes (`npm audit`)
- [ ] Documentation is up to date
- [ ] No breaking changes without a major version bump (unless pre-release)

After releasing:

- [ ] GitHub Release was created
- [ ] npm publish workflow completed successfully
- [ ] Package is accessible: `npm view @ouim/simple-logto@latest`
- [ ] Announce in changelog/releases

---

## See Also

- [CONTRIBUTING.md](../CONTRIBUTING.md) — Full contributing guidelines
- [package.json](../package.json) — Scripts and dependencies
- `.github/workflows/` — Workflow definitions
- [Conventional Commits](https://www.conventionalcommits.org/) — Commit message standard
- [Semantic Versioning](https://semver.org/) — Version numbering
