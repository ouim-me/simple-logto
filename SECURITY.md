# Security Policy

## Supported Versions

Security fixes are applied to the latest published release on the `master` release line and to the current `rc` branch before that work is merged for release.

Older published versions may not receive backported fixes. If you report an issue against an older version, you may be asked to verify it against the latest release or the current `rc` branch.

## Reporting a Vulnerability

Do not open public GitHub issues for suspected vulnerabilities.

Use one of these private reporting paths instead:

- GitHub Security Advisories: open a private vulnerability report in this repository's `Security` tab if that feature is enabled for your access level.
- Email: send a report to `security@ouim.me`.

Include the following when possible:

- affected package version
- impact summary
- reproduction steps or proof of concept
- whether the issue depends on specific browser, Node.js, or deployment settings
- any proposed mitigation if you already identified one

## Disclosure Process

- Initial acknowledgement target: within 5 business days
- Triage and severity assessment: as quickly as practical after reproduction
- Fix timeline: depends on severity and release risk, but critical auth or token-handling issues are prioritized
- Coordinated disclosure: preferred after a fix or mitigation is available

Please avoid public disclosure until the issue has been confirmed and a remediation plan is in place.

## Scope

This policy covers vulnerabilities in the published `@ouim/simple-logto` package, including:

- frontend auth helpers and UI exported from `@ouim/simple-logto`
- backend verification and middleware exported from `@ouim/simple-logto/backend`
- build helper exports from `@ouim/simple-logto/bundler-config`

Operational issues in third-party services, tenant misconfiguration in consumer apps, or vulnerabilities that exist only in an outdated unsupported version may fall outside direct remediation scope, but they are still useful to report.
