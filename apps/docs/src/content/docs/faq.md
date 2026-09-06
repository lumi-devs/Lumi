---
title: "FAQ"
description: "Frequently asked questions about self-hosting, configuration, addons, and operations."
category: "Governance & Help"
---

# Frequently Asked Questions

## What is Lumi?

A modular, self-hosted Discord bot built on TypeScript, Bun, Sapphire Framework, discord.js v14, PostgreSQL (Prisma ORM), and Redis. You retain complete ownership and control over your database, message logs, and server configuration. See [Built-In Modules](/modules) for full details.

---

## What is the difference between a "module" and an "addon"?

They share the same runtime module engine (`@DefineModule`, `Module`, lifecycle hooks), but differ in packaging and distribution:

- **Built-in Module**: Ships directly in the monorepo under `packages/core/src/modules/` and inherits versioning from `packages/core/package.json`.
- **Addon**: An external package installed dynamically via Lumi's Downloader (such as from [`lumi-addons`](https://github.com/lumi-devs/lumi-addons)) into `data/installed-modules/` without rebuilding the core bot.

To build an extension, see the [Quick Start Guide](/guides/quick-start-addon) or [Module Creation Guide](/guides/module-creation).

---

## Do I need to run the web dashboard?

No. Lumi is fully functional directly from Discord via slash commands and `/lumi panel`. The Next.js dashboard (`apps/dashboard`) is optional and connects to `apps/worker` over an authenticated RPC bridge.

---

## Is the verification challenge a real CAPTCHA?

No. The verification panel (`/verifypanel`) posts an interactive emoji sequence challenge designed to mitigate automated mass-join spam bots. It does not replace third-party enterprise CAPTCHA services, but stops uncoordinated automated join raids.

---

## Is it safe to install third-party addons?

Addons execute in-process inside the bot runtime. You should only install addons from repositories and authors you trust. Review the [Addon Publishing Guide](/guides/addon-publishing) and [Security Policy](https://github.com/lumi-devs/Lumi/blob/main/SECURITY.md).

---

## How does GDPR data erasure work?

When a user triggers data erasure (`global.gdpr.delete` RPC or owner commands), Lumi orchestrates `deleteUserData(userId)` across all loaded modules and repository tables, purging user-keyed rows from PostgreSQL and Redis.

---

## How do I update Lumi?

```bash
git pull
bun install
bunx prisma migrate deploy
docker compose up -d --build worker
```

---

## What happens if the Redis container restarts?

PostgreSQL serves as the durable system of record. Redis manages caching (DB `0`), BullMQ task queues (DB `1`), and the Redis Streams event bus. Temporary Redis restarts do not compromise persistent configuration or moderation records.

