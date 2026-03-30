# Documentation Index

Welcome to the `@ouim/simple-logto` documentation. This guide helps you navigate all available resources.

## Getting Started

**First time here?** Start with the main [README.md](../README.md) for an overview and quick-start guide.

---

## Core Documentation

### 1. Security & Advanced Features
**File:** [SECURITY_AND_FEATURES.md](./SECURITY_AND_FEATURES.md)

Covers security hardening features including:
- CSRF protection with double-submit cookies
- Secure cookie handling (HttpOnly, Secure, SameSite)
- XSS limitations and mitigation strategies
- JWT validation and JWKS cache invalidation
- postMessage origin verification
- Network error resilience
- Recommended security checklist

**Read this if:** You're concerned about security, need CSRF protection, or want to understand what protections are built in.

---

### 2. Permissions & Role-Based Authorization
**File:** [PERMISSIONS_AND_AUTHORIZATION.md](./PERMISSIONS_AND_AUTHORIZATION.md)

Complete guide to permission and role checking:
- `usePermission` hook for frontend checks
- Backend `checkRoleAuthorization` and `checkMultiScopeAuthorization` helpers
- Permission claim formats and normalization
- Common authorization patterns (OBAC, multi-tenant, time-based)
- Setting up roles and scopes in Logto
- Debugging permissions
- Best practices

**Read this if:** You need to restrict features based on user roles or permissions, or want to set up authorization in your app.

---

### 3. Migration Guide
**File:** [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md)

Breaking changes and new features in v0.1.9+:
- `UserCenter` now defaults to local sign-out (safer default)
- New `usePermission` hook
- New backend authorization helpers
- CSRF protection
- Provider lifecycle callbacks
- Configurable post-callback redirect
- All bug fixes with explanations
- Troubleshooting common migration issues

**Read this if:** You're upgrading from v0.1.8 or earlier, or want to understand what changed.

---

### 4. Backend API Reference
**File:** [../src/backend/README.md](../src/backend/README.md)

Complete backend verification documentation:
- JWT verification overview
- Express.js middleware
- Next.js API routes and middleware
- Scope-based authorization
- Guest session handling
- Custom headers and claim validation

**Read this if:** You're setting up backend authentication for your API, using Express or Next.js.

---

## Infrastructure & Release

### 5. CI/CD & Release Process
**File:** [CI_CD_AND_RELEASES.md](./CI_CD_AND_RELEASES.md)

GitHub Actions workflows and release procedures:
- Validation workflow (lint, type-check, test, build)
- Smoke test fixtures for real-world scenarios
- Package audit and security checks
- npm publishing with build provenance
- Bundle size monitoring
- Branch protection rules
- Local development and troubleshooting

**Read this if:** You're contributing code, setting up CI/CD, or releasing a new version.

---

### 6. Linked Local Package Troubleshooting
**File:** [LINKED_LOCAL_PACKAGE_TROUBLESHOOTING.md](./LINKED_LOCAL_PACKAGE_TROUBLESHOOTING.md)

Focused guide for local `file:` dependencies and symlinked development:
- duplicate React / invalid hook call failures
- Vite dedupe and alias fixes
- preserving inherited `viteConfig.resolve` settings
- Next.js App Router client-boundary issues

**Read this if:** You're developing `@ouim/simple-logto` locally and consuming it from another app via `file:../simple-logto` or a symlink.

---

## Project Standards

### 7. Contributing Guidelines
**File:** [../CONTRIBUTING.md](../CONTRIBUTING.md)

How to contribute to this project:
- Setting up local development
- Branch naming and workflow
- Commit message standards (Conventional Commits)
- Testing requirements
- Pull request process
- Release process

**Read this if:** You want to contribute code or fixes.

---

### 8. Code of Conduct
**File:** [../CODE_OF_CONDUCT.md](../CODE_OF_CONDUCT.md)

Community standards and expectations.

---

### 9. Security Policy
**File:** [../SECURITY.md](../SECURITY.md)

Vulnerability disclosure and responsible security reporting.

**Read this if:** You've found a security issue.

---

### 9. Changelog
**File:** [../CHANGELOG.md](../CHANGELOG.md)

Complete version history with all changes documented.

---

## Development References

### 10. Architecture Notes (in `notes/` folder)

Working notes and implementation details:

- **[tasks-v2.md](./notes/tasks-v2.md)** — Detailed task breakdown and implementation notes for v0.1.9
- **[tasks-imprv.md](./notes/tasks-imprv.md)** — Improvement backlog and completed enhancements
- **[implement_auth.md](./notes/implement_auth.md)** — Auth flow implementation reference
- **[todo.md](./notes/todo.md)** — Project TODO list

These are internal working documents, not part of the published API surface.

---

### 11. Agent Instructions
**File:** [../AGENTS.md](../AGENTS.md)

Guidance for Claude Code and AI agents contributing to this repository. Includes:
- Command reference
- Architecture overview
- File structure
- Testing strategy

---

## Examples

### 12. Example Applications

**Frontend Only (Vite + React):**
- [example_app/README.md](../example_app/README.md)
- Includes Express backend verification under [example_app/server/README.md](../example_app/server/README.md)

**Next.js Integration:**
- [examples/nextjs-app-router/README.md](../examples/nextjs-app-router/README.md)

**Smoke Test Fixtures:**
- [smoke-fixtures/](../smoke-fixtures/) — Real-world integration tests for various bundlers and frameworks

---

## Quick Navigation

### By Use Case

**"I'm setting up authentication for the first time"**
1. Start with [../README.md](../README.md) — Quick Start section
2. Follow [../MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md) if upgrading from older version
3. Check [../src/backend/README.md](../src/backend/README.md) for backend setup

**"I need role-based access control"**
1. Read [PERMISSIONS_AND_AUTHORIZATION.md](./PERMISSIONS_AND_AUTHORIZATION.md)
2. Check [SECURITY_AND_FEATURES.md](./SECURITY_AND_FEATURES.md) for backend helper details

**"I'm concerned about security"**
1. Read [SECURITY_AND_FEATURES.md](./SECURITY_AND_FEATURES.md)
2. Review [../SECURITY.md](../SECURITY.md)
3. Check [PERMISSIONS_AND_AUTHORIZATION.md](./PERMISSIONS_AND_AUTHORIZATION.md) for best practices

**"I want to contribute code"**
1. Read [../CONTRIBUTING.md](../CONTRIBUTING.md)
2. Check [CI_CD_AND_RELEASES.md](./CI_CD_AND_RELEASES.md) for CI/CD details
3. Review [../AGENTS.md](../AGENTS.md) if using AI assistance

**"I'm upgrading from an older version"**
1. Read [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md)
2. Check [../CHANGELOG.md](../CHANGELOG.md) for version history

**"I have a bug or security issue"**
1. Check [../SECURITY.md](../SECURITY.md) for security issues
2. See main [README.md](../README.md) — Troubleshooting section
3. File an issue with reproduction steps

---

## Document Structure

```
├── README.md (you are here)
├── SECURITY_AND_FEATURES.md
├── PERMISSIONS_AND_AUTHORIZATION.md
├── MIGRATION_GUIDE.md
├── CI_CD_AND_RELEASES.md
└── notes/
    ├── tasks-v2.md
    ├── tasks-imprv.md
    ├── implement_auth.md
    ├── todo.md
    └── ...
```

---

## Important Links

### Public Resources
- **GitHub:** https://github.com/ouim-me/simple-logto
- **npm:** https://www.npmjs.com/package/@ouim/simple-logto
- **Logto:** https://logto.io
- **@logto/react:** https://docs.logto.io/docs/sdk/react

### Standards & Specifications
- [RFC 7519 — JSON Web Token](https://tools.ietf.org/html/rfc7519)
- [OpenID Connect Core](https://openid.net/specs/openid-connect-core-1_0.html)
- [OWASP CSRF Prevention](https://owasp.org/www-community/attacks/csrf)
- [Semantic Versioning](https://semver.org/)
- [Conventional Commits](https://www.conventionalcommits.org/)

---

## Feedback & Issues

Have a question or found a problem with the documentation?

1. Check if it's answered in the relevant guide above
2. Search existing GitHub issues
3. Open a new issue with:
   - What you were trying to do
   - What the documentation said
   - What you expected vs. what happened
   - Your environment (Node version, framework, browser)

---

**Last updated:** March 30, 2026
