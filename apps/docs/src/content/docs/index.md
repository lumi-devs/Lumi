---
title: "Documentation Hub"
description: "Documentation hub for Lumi, a modular self-hosted Discord bot framework built with TypeScript and Bun."
---

Engineering documentation for **Lumi** - a modular, self-hosted Discord bot framework built with TypeScript and Bun.

## Guides

| Document | Description |
| :--- | :--- |
| [Architecture & System Topology](/Lumi/architecture/) | Process roles (`worker`, `scheduler`, `dashboard`), the Redis Streams event bus, sharding/clustering, database layer, command registration, observability. |
| [Configuration Reference](/Lumi/configuration/) | Every environment variable, Docker Compose service, and Kubernetes manifest. |
| [Dashboard Reference](/Lumi/dashboard/) | `apps/dashboard`: App Router route inventory, the internal HTTP RPC bridge and its 50 actions, read vs. mutation paths, NextAuth v5 + the authz cache and route guards, the CSP nonce middleware, design tokens. |
| [Modules & Features](/Lumi/modules/) | The nine built-in modules, plus a deep dive into the security suite (anti-nuke, join-gate, verification, panic mode, filter heat escalation). |
| [Quick Start: Your First Addon](/Lumi/guides/quick-start-addon/) | Fastest path from a clean checkout to a working `/slash` command, using `bun run addon:create`. |
| [Module Creation Guide](/Lumi/guides/module-creation/) | Step-by-step: config schema, commands, listeners, services, interaction handlers, scheduled tasks, persistence, i18n - built around a full walkthrough of the real `afk` module. |
| [Addon Publishing Guide](/Lumi/guides/addon-publishing/) | Writing and submitting an addon to [`lumi-addons`](https://github.com/lumi-devs/lumi-addons): the stricter rules addons run under, the pre-submission checklist, and the PR workflow. |
| [Addon SDK API Reference](/Lumi/api-reference/) | Every export of `"lumi"` and its subpaths (`lumi/commands`, `lumi/permissions`, `lumi/scheduling`, `lumi/ui`, `lumi/utils`) - the addon-facing API surface. |
| [Self-Hosting Guide](/Lumi/guides/self-hosting/) | Running your own instance: prerequisites, Docker Compose services, first-run steps, updates, backups. |
| [Production Deployment Guide](/Lumi/guides/production-deployment/) | Hardening/scaling beyond self-hosting: clustering, secrets management, monitoring, zero-downtime deploys. |
| [FAQ](/Lumi/faq/) | Common questions - modules vs. addons, dashboard requirements, GDPR, updating, translations. |
| [Troubleshooting](/Lumi/troubleshooting/) | Symptom-first index across boot, dashboard, sharding/clustering, addons, and observability. |

## Project policies

| Document | Description |
| :--- | :--- |
| [Contributing Guide](https://github.com/lumi-devs/Lumi/blob/main/CONTRIBUTING.md) | Coding standards, workflow, and pull request guidelines. |
| [Security Policy](https://github.com/lumi-devs/Lumi/blob/main/SECURITY.md) | Responsible disclosure and vulnerability reporting. |
| [AI & Agent Blueprint](https://github.com/lumi-devs/Lumi/blob/main/AGENTS.md) | Operational rules for agents (human or AI) working in this codebase - module system boundaries, path aliases, anti-pattern list. Source of truth for anything this docs folder summarizes. |

## Workspace packages & apps

- **Apps** - entrypoints for the runtime roles:
  - [`apps/worker`](https://github.com/lumi-devs/Lumi/blob/main/apps/worker/README.md) - Discord gateway connection & command execution
  - [`apps/scheduler`](https://github.com/lumi-devs/Lumi/blob/main/apps/scheduler/README.md) - BullMQ task queue processor
  - [`apps/dashboard`](https://github.com/lumi-devs/Lumi/blob/main/apps/dashboard/README.md) - Web management panel
- **Packages** - shared libraries & core framework:
  - [`packages/core`](https://github.com/lumi-devs/Lumi/blob/main/packages/core/README.md) - Framework core, module loader, database service
  - [`packages/event-bus`](https://github.com/lumi-devs/Lumi/blob/main/packages/event-bus/README.md) - Redis Streams event bus between worker and scheduler
  - [`packages/sharding`](https://github.com/lumi-devs/Lumi/blob/main/packages/sharding/README.md) - Shard planner, shard telemetry
  - [`packages/observability`](https://github.com/lumi-devs/Lumi/blob/main/packages/observability/README.md) - Prometheus & OpenTelemetry instrumentation
  - [`packages/contracts`](https://github.com/lumi-devs/Lumi/blob/main/packages/contracts/README.md) - RPC schemas & shared type definitions

## Quick links

- [GitHub Repository](https://github.com/lumi-devs/Lumi)
- [Issue Tracker](https://github.com/lumi-devs/Lumi/issues)
- [Discussions](https://github.com/lumi-devs/Lumi/discussions)
- [Wiki](https://github.com/lumi-devs/Lumi/wiki) - mirrors this `docs/` folder automatically on every push to `main`
- [Security Advisories](https://github.com/lumi-devs/Lumi/security/advisories)

