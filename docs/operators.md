# Operators

## Configure

Copy `.env` (`.env.local` overrides). `lumi config` prints the resolved
configuration without starting anything.

## Database

Postgres via Prisma. `prisma/migrations/` holds a single `v1` baseline
generated from `schema.prisma` - new databases start there:

```
bun run db:migrate    # prisma migrate dev (needs Postgres up)
bun run db:generate   # regenerate the client after a schema change
```

A database that already applied the pre-squash history must mark the
baseline applied once: `prisma migrate resolve --applied "20261011000000_v1"`.
Back up with `pg_dump` on whatever schedule you keep for everything
else; there is no in-bot backup command.

## Cache and scheduler

Valkey for ephemeral state (cooldowns, antispam, sticky message ids) and
one BullMQ queue with priorities for scheduled module tasks. One process
runs everything: gateway, RPC, and scheduling together.

## Run

```
bun src/Index.ts            # the bot
docker compose up bot       # bot + postgres + valkey (+ dashboard)
```

`CMD` runs `bun src/Index.ts`; `/usr/local/bin/lumi` links the CLI.

## CLI

```
lumi start                  # start the bot
lumi migrate                # prisma migrate deploy | status
lumi addon create <name>    # scaffold a third-party addon
lumi addon validate <dir>   # structure, import, and UI checks
lumi commands               # deploy slash commands to Discord
lumi module                 # inspect bundled modules
lumi config                 # print resolved env config
```
