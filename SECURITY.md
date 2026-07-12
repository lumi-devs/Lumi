# Security Policy

## Supported Versions

Only the latest version is supported for security updates.

## Reporting a Vulnerability

If you discover a security vulnerability within Lumi, please do NOT report it in a public issue. Instead, send an email to security@lumi-devs.org or reach out to the core maintainers privately.

## Addons and Sandboxing

> [!WARNING]
> Third-party addons executed by Lumi have NO strict sandboxing (such as `vm2` or `isolated-vm`). 
> Addons run with the same privileges as the bot process, meaning they have access to the bot token, database credentials, and file system.
> Only install addons from sources and authors you trust completely.
