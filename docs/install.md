# Install

## Prerequisites

- Bun 1.x.
- Postgres 16+, Valkey 7+.
- A Discord application token with the `bot` scope and these intents:
  `Guilds`, `GuildMembers` (privileged), `GuildMessages`,
  `MessageContent` (privileged), `GuildVoiceStates`, `GuildModeration`.

## Configure

```sh
cp .env.example .env   # if present, otherwise create .env
```

Required keys: `DISCORD_TOKEN`, `POSTGRES_URL`, `VALKEY_URL`, `OWNER_IDS`
(comma-separated user IDs). `lumi config` prints the resolved
configuration without starting anything.

## Migrate and run

```sh
bun run db:migrate   # apply the v1 baseline (needs Postgres up)
bun src/Index.ts     # the bot: db -> modules -> slash -> RPC -> gateway
```

With Docker:

```sh
docker compose up bot   # bot + postgres + valkey (+ dashboard)
```

The `migrate` one-shot service runs `prisma migrate deploy` before the
bot starts. A database that already applied the pre-squash history must
mark the baseline applied once:

```sh
bunx prisma migrate resolve --applied "20261011000000_v1"
```

## First steps

1. Invite the bot, then run `/module status` (owner-only) to see loaded
   vs available modules.
2. Open `/module info afk` and enable what you need with
   `/module enable <name>`.
3. Point `/module install` at a repo to add third-party addons
   (`guide_publish.md`).
