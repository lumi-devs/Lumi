# Lumi Docker deployment

Single-process image, one compose file. The bot (`src/Index.ts`) runs the
Discord gateway, the dashboard RPC bridge, and BullMQ scheduling in one Bun
process.

## Dockerfile

Stages `base` → `deps` → `source` → `bot` (root `Dockerfile`). The `bot`
target is the only runtime target: it runs `bun src/Index.ts` as user `bun`
and also compiles the `lumi` and `lumi-setup` binaries to `/usr/local/bin`.

## Compose services

Default (`docker compose up -d`): `postgres`, `valkey`, `migrate` (one-shot
`prisma migrate deploy`, exits), `bot` (container `lumi-bot`, waits on
`migrate` plus healthy `postgres`/`valkey`).

Opt-in profiles:

| Service | Profile | Notes |
|---|---|---|
| `lumi-dev` | `development` | Live-mount dev shell |
| `dashboard` | `dashboard` | Needs `DASHBOARD_SESSION_SECRET` in `.env` |
| `pgbouncer` | `pgbouncer`, `scale` | Point `POSTGRES_URL` at `pgbouncer:6432` to use |
| `nirn-proxy` | `scale` | Shared Discord REST rate-limit proxy |
| `backup` | `backup` | Looping `pg_dump -Fc` to the `backup-data` volume |
| `otel-collector`, `prometheus`, `tempo`, `grafana` | `observability` | Grafana on `127.0.0.1:3001`, Prometheus on `127.0.0.1:9091` |

`POSTGRES_URL` points at `postgres:5432` by default; `DIRECT_POSTGRES_URL`
always points straight at `postgres` for migrations. `bot` requires
`RPC_INTERNAL_TOKEN` in `.env`.

## First install

See the root `README.md` quickstart: `lumi-setup init` writes `.env` +
`compose.yml`, then `docker compose up -d`.
