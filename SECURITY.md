# Security Policy

## Supported Versions

The following table details which versions of Lumi are currently supported with security updates and patches.

| Version | Supported          | Security Maintenance |
| ------- | ------------------ | -------------------- |
| 0.6.x   | :white_check_mark: | Active Development   |
| < 0.6   | :x:                | End of Life (EOL)    |

## Reporting a Vulnerability

We take the security of Lumi very seriously. If you suspect or discover a security vulnerability in this project, please report it immediately through private channels. **Do not submit public GitHub issues, pull requests, or forum posts for security vulnerabilities.**

### Disclosure Process

1. **Private Vulnerability Reporting**:
   - Prefer using GitHub's **Private Vulnerability Reporting** feature via the [Security tab](https://github.com/lumi-devs/lumi/security/advisories/new) of this repository.
   - Alternatively, email the maintenance team directly at `security@lumi-devs.org` with details.

2. **Information to Include**:
   - Detailed description of the vulnerability and its potential impact.
   - Step-by-step reproduction steps or a minimal Proof-of-Concept (PoC).
   - Affected components, versions, and configuration settings.
   - Any proposed remediation or patch if available.

3. **Response Timeline**:
   - **Acknowledgment**: Within 48 hours of receipt.
   - **Triage & Assessment**: Within 7 business days.
   - **Patch Delivery & Release**: Coordinated disclosure within 30 days depending on severity.

## Addons and Sandboxing Policy

Every addon is bundled and run in a V8 isolate inside a Node sidecar (`packages/core/src/lib/addon-sandbox/`, `packages/core/src/runtime/addon-isolate-runner.mjs`). There is no other execution mode. Inside the isolate:

- **No ambient authority**: no filesystem, network, subprocess, `process`, `fetch`, `WebSocket`, or `require` access at all. The only host contact is the `__hostCall` bridge, which speaks the same JSON RPC as the protocol.
- **Memory and CPU bounds**: each isolate has a configurable memory limit (`LUMI_ISOLATE_MEMORY_MB`, default 128) and invocations run under timeouts; an out-of-memory or wedged isolate is discarded and the host crash-loop guard applies.
- **No secret inheritance**: the sidecar gets an allowlisted environment (`PATH`, `HOME`, `TZ`, `LANG`, `LC_ALL`, `NODE_ENV`) plus `LUMI_ADDON_*` metadata. Bot token, database URIs, and API keys are never passed through.
- **Capability-gated host RPC**: every host method declares a required capability (`capabilities.ts`); unknown methods are denied by default. Broad capabilities (`valkey`, `scheduling`, Discord management scopes) are opt-in per addon manifest.
- **Namespaced interactions**: an addon only receives button/select/modal interactions under its own `<addonName>:` prefix; prefixes outside its namespace are ignored.
- **Optional signature enforcement**: `ADDON_SIGNATURE_POLICY=warn|require` verifies git SSH commit signatures against `ADDON_ALLOWED_SIGNERS_FILE`; `require` refuses to start on misconfiguration.

> [!WARNING]
> Granted capabilities convey real power (sending messages, managing roles, KV writes) — only install addons from sources you trust, review requested capabilities before enabling, and inspect third-party privacy statements via `/mydata 3rdparty`.

## RPC Bridge (Dashboard ↔ API)

`apps/api` serves the dashboard over an internal HTTP RPC bridge (`rpc-http-server.ts`):

- **Bearer auth**: dashboard calls present `Authorization: Bearer <RPC_INTERNAL_TOKEN>`, compared in constant time. `apps/api` refuses to start unauthenticated when `NODE_ENV=production`.
- **Loopback by default**: keep `RPC_HTTP_HOST=127.0.0.1` unless the dashboard runs in another container/pod; never expose the RPC port to the public internet — `actorId` on an RPC body is an unsigned claim.
- **Contract enforcement**: callers must send `x-lumi-contract-version` within `COMPATIBLE_CONTRACT_RANGE`; mismatched callers are rejected.

Generate the token with `openssl rand -hex 32` and set it identically on `apps/api` and the dashboard.

## Data Privacy (GDPR/CCPA)

- `/mydata whatdata|getmydata|forgetme` gives end users access, export (JSON), and erasure with per-module `exportUserData`/`deleteUserData` hooks. A failing module hook is reported, not silently swallowed — partial erasure beats none, but follow up on failures.
- Retention is operator-configured: `AUDIT_RETENTION_DAYS`, `CONFIG_HISTORY_RETENTION_DAYS`, `MODERATION_RETENTION_DAYS`, `ECONOMY_TRANSACTION_RETENTION_DAYS`, `GUILD_DATA_RETENTION_DAYS`, with optional pre-delete archival via `AUDIT_ARCHIVE_DIR`.
- Ban/timeout appeal links are HMAC-SHA256 signed with `APPEAL_TOKEN_SECRET` (bot-only; the dashboard forwards the opaque token for verification).

## Telemetry

Sentry is opt-in via `SENTRY_DSN` (off when unset). Enabling it ships error payloads off-host — review what your deployment captures before turning it on in production.

## Security Best Practices for Operators

- Store all secrets (bot token, DB credentials, `RPC_INTERNAL_TOKEN`, `DASHBOARD_SESSION_SECRET`, `APPEAL_TOKEN_SECRET`, `SENTRY_DSN`) in environment variables or `.env` files with restricted file permissions (`600`). `.env` is gitignored — never commit it.
- Ensure Valkey and PostgreSQL instances require authentication and are network-isolated.
- Keep `RPC_HTTP_HOST` and `METRICS_HOST` on loopback unless cross-container scraping/access is required.
- Keep dependencies updated via Dependabot alerts.
