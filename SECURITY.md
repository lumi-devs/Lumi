# Security Policy

## Supported Versions

Currently, the `main` branch of Lumi receives security updates. Older or unsupported forks will not receive official security updates.

## Reporting a Vulnerability

If you discover a security vulnerability within Lumi, please do NOT report it in a public issue. Instead, we make use of GitHub's private vulnerability reporting feature (More information can be found [here](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing/privately-reporting-a-security-vulnerability)).
This ensures that all maintainers have access to the reported vulnerability before it is disclosed publicly.

### Opening a Vulnerability Report

To open a vulnerability report, please navigate to the "Security" tab of this repository and select "Report a vulnerability" or fill out the appropriate form in the Advisories section. Alternatively, send an email to `security@lumi-devs.org`.

You will be asked to provide a summary, details, and proof of concept for your vulnerability report. We ask that you fill out this form to the best of your ability, with as many details as possible.

### Timeline

We will try to answer your report within 7 days. If you haven't received an answer by then, we suggest you reach out to us privately via our [Discord server](https://discord.gg/YOUR_INVITE), by contacting a maintainer.

## Addons and Sandboxing

> [!WARNING]
> Third-party addons executed by Lumi have NO strict sandboxing (such as `vm2` or `isolated-vm`). 
> Addons run with the same privileges as the bot process, meaning they have access to the bot token, database credentials, and file system.
> Only install addons from sources and authors you trust completely.

