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

There is no sandbox or isolate. Addons load in-process through the same
module loader as core modules (`src/lib/module-system/ModuleStore.ts`,
`#loadAddon` path for roots outside `src/modules`): an addon can import
anything core code can. Treat installing an addon like adding a
dependency — only install addons from sources you trust.

What the framework does enforce, via `bun run validate` and the install
path (`src/lib/downloader/`):

- **Self-containment**: no imports from sibling modules; shared code
  comes from `src/lib/` or `src/contracts/`.
- **No raw embeds or direct DB access in commands**: the validator warns
  on `new EmbedBuilder()` and on `container.prisma` use outside the
  repository layer.
- **Optional signature enforcement**: `ADDON_SIGNATURE_POLICY=off|warn|require`
  verifies git SSH commit signatures against
  `ADDON_ALLOWED_SIGNERS_FILE`; `require` refuses to install or update
  from unsigned or untrusted commits.
- **Revision-pinned installs**: a revision-pinned install checks out a
  detached revision and never silently changes underneath a guild;
  `/module pin` holds a revision across updates.

> [!WARNING]
> An installed addon runs with full in-process authority — only install
> addons from sources you trust, and inspect third-party privacy
> statements via `/mydata 3rdparty`.

## RPC Bridge (Dashboard ↔ Bot)

The embedded RPC server (`src/lib/rpc/HttpServer.ts`, started from
`src/Index.ts`) serves the dashboard over HTTP. There is no separate API
service and no REST surface: every action is a typed entry in the
contract router under `src/contracts/rpc/`.

- **Bearer auth**: dashboard calls present `Authorization: Bearer <RPC_INTERNAL_TOKEN>`, compared in constant time. The server refuses a non-loopback `RPC_HTTP_HOST` with no token set.
- **Loopback by default**: keep `RPC_HTTP_HOST=127.0.0.1` unless the dashboard runs in another container/pod; never expose the RPC port to the public internet — `actorId` on an RPC body is an unsigned claim.
- **Contract enforcement**: callers must send `x-lumi-contract-version` within `COMPATIBLE_CONTRACT_RANGE` (`src/contracts/Version.ts`); mismatched callers are rejected.

Generate the token with `openssl rand -hex 32` and set it identically on the bot and the dashboard.

## Data Privacy (GDPR/CCPA)

- `/mydata whatdata|3rdparty|getmydata|forgetme` gives end users access, export (JSON), and erasure with per-module `exportUserData`/`deleteUserData` hooks. A failing module hook is reported, not silently swallowed — partial erasure beats none, but follow up on failures.
- Retention is operator-configured: `AUDIT_RETENTION_DAYS`, `CONFIG_HISTORY_RETENTION_DAYS`, `MODERATION_RETENTION_DAYS`, with optional pre-delete archival via `AUDIT_ARCHIVE_DIR`. GDPR exports are signed download tokens (`GDPR_EXPORT_SIGNING_SECRET`, falling back to `RPC_INTERNAL_TOKEN`).
- Ban/timeout appeal links are HMAC-SHA256 signed with `APPEAL_TOKEN_SECRET` (required at boot; the dashboard forwards the opaque token for verification).

## Telemetry

Sentry is opt-in via `SENTRY_DSN` (off when unset). Enabling it ships error payloads off-host — review what your deployment captures before turning it on in production.

## Security Best Practices for Operators

- Store all secrets (bot token, DB credentials, `RPC_INTERNAL_TOKEN`, `DASHBOARD_SESSION_SECRET`, `APPEAL_TOKEN_SECRET`, `SENTRY_DSN`) in environment variables or `.env` files with restricted file permissions (`600`). `.env` is gitignored — never commit it.
- Ensure Valkey and PostgreSQL instances require authentication and are network-isolated.
- Keep `RPC_HTTP_HOST` and `METRICS_HOST` on loopback unless cross-container scraping/access is required.
- Keep dependencies updated via Dependabot alerts.
