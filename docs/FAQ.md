# FAQ

## What is Lumi?

A self-hosted, modular Discord bot built with Bun, TypeScript, discord.js v14, and the [Sapphire Framework](https://sapphirejs.dev). Every feature is a hot-swappable module - toggle, configure, and extend without restarting the bot or touching core code. See [Architecture](architecture.md) for how the pieces fit together.

## What's the difference between a "module" and an "addon"?

Same underlying mechanism (`Module` + `@DefineModule`, see [API Reference](API_REFERENCE.md)), different distribution path:

- A **module** ships inside this repo, under `packages/core/src/modules/`, versioned and released with the rest of Lumi. See [Modules & Features](modules.md) for the full built-in list.
- An **addon** is a module distributed outside this repo (typically via [`lumi-addons`](https://github.com/lumi-devs/lumi-addons)) and installed at runtime through the built-in downloader (`,repo add`, `,download`) - no restart, no rebuild. See [Addon Publishing Guide](GUIDE_ADDON_PUBLISHING.md).

If you're building something to ship *with* the bot, use the [Module Creation Guide](GUIDE_MODULE_CREATION.md); if it's for outside distribution, start at [Quick Start: Your First Addon](QUICK_START_ADDON.md).

## Do I need to run more than one `worker` replica?

No, not until Discord's recommended shard count for your bot outgrows what one process can hold, or you specifically want zero-downtime deploys / redundancy against a single process crash. A single `worker` with `TOTAL_SHARDS=auto` and no `CLUSTER_NAME` handles every shard Discord assigns it in one process. See [Production Deployment § Do you actually need to scale past one replica?](GUIDE_PRODUCTION_DEPLOYMENT.md#do-you-actually-need-to-scale-past-one-replica).

## Is the web dashboard required?

No. `apps/dashboard` is an optional Next.js app that talks to `worker` over an internal HTTP RPC bridge; disabling the `dashboard` module only disables the RPC surface it depends on, not the rest of the bot. Everything else runs fine with it never started. See [Self-Hosting § Optional: the web dashboard](GUIDE_SELF_HOSTING.md#6-optional-the-web-dashboard).

## Is the join-verification challenge a real CAPTCHA?

No - it's a click-sequence challenge (a row of emoji buttons clicked in a target order), which stops simple join-bots but not targeted abuse. See [Modules & Features § Join-gate & verification](modules.md#join-gate--verification).

## Is addon code safe to install?

Not inherently - addon code runs **inside the bot process** with full access to its database, cache, and Discord client, and Lumi does not review or vet third-party addon repositories. `,repo add` shows a one-time confirmation warning before cloning a repository for exactly this reason. Only add repositories you trust. See [Addon Publishing Guide § How installation works](GUIDE_ADDON_PUBLISHING.md#how-installation-works) and [Security Policy](../SECURITY.md).

## Does deleting a user's data actually work end-to-end?

Partially, as of this writing. Four built-in modules (`afk`, `mod`, `logging`, `tempvc`) implement the `deleteUserData` lifecycle hook, but the GDPR RPC handler currently deletes only global `Blocklist`/`AuditLedger`/`User` rows and does **not** iterate loaded modules to call their hooks. If a deletion request depends on a specific module's hook running, verify the call path yourself first. See [Modules & Features § GDPR data deletion - known gap](modules.md#gdpr-data-deletion---known-gap).

## How do I update my instance?

`git pull && bun install && bun run db:migrate`, then restart `worker` (Docker: `docker compose up -d --build worker`; bare-metal: `/lumi update` inside Discord, or restart your process manager). Check `packages/core/CHANGELOG.md` or GitHub Releases for anything migration-adjacent first. See [Self-Hosting § Updating](GUIDE_SELF_HOSTING.md#updating).

## Is my data safe if I lose the Redis container?

Yes - Redis only holds cache, rate-limit, and queue state that's safe to lose (it repopulates). PostgreSQL is the sole system of record; back it up with `pg_dump`. See [Self-Hosting § Backups](GUIDE_SELF_HOSTING.md#backups).

## Can I help translate Lumi?

Yes - localization is centralized in `packages/core/src/languages/en-US/` and managed through [Crowdin](https://crowdin.com/project/lumi-bot). See the root [README](../README.md#translations).

## Something here doesn't match the code

Open a discussion or issue on the [GitHub repo](https://github.com/lumi-devs/Lumi) - this page (and the rest of `docs/`) is written against the current source and synced verbatim to the [wiki](https://github.com/lumi-devs/Lumi/wiki) on every push to `main`, so a mismatch is a bug in the docs, not the code.
