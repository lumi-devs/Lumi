# Security Policy

## Supported Versions

The following table details which versions of Lumi are currently supported with security updates and patches.

| Version | Supported          | Security Maintenance |
| ------- | ------------------ | -------------------- |
| 1.x.x   | :white_check_mark: | Active Development   |
| < 1.0   | :x:                | End of Life (EOL)    |

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

> [!WARNING]
> Third-party addons executed by Lumi run in the same process environment as the core bot.
> There is **NO** strict sandboxing (e.g., V8 isolate boundary) for downloaded third-party modules.
> Addons have full access to process environment variables (including bot token, database URIs, and API keys), system network interfaces, and file storage.
> Only install and activate addons from source repositories and authors you fully trust.

## Security Best Practices for Operators

- Store all secrets (tokens, DB credentials, RabbitMQ passwords) in environment variables or standard `.env` files with restricted file permissions (`600`).
- Ensure Redis and PostgreSQL instances require authentication and are network-isolated.
- Keep dependencies updated via Dependabot alerts.
