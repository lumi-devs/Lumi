---
title: "Troubleshooting"
description: "Common troubleshooting scenarios, error diagnostics, and resolutions."
category: "Governance & Help"
---

# Troubleshooting Guide

## Bot Startup & Gateway Issues

### Process Exits Immediately on Boot
- **Cause**: Missing or invalid `BOT_TOKEN` in `.env`.
- **Resolution**: Verify your bot token in the Discord Developer Portal. Run `bun run setup` to validate your token against Discord's `/users/@me` endpoint.

### Slash Commands Do Not Appear in Discord
- **Cause**: Discord global application command propagation delay (up to 1 hour for global updates).
- **Resolution**: Test in a specific development guild during initial testing, or check startup logs to verify that `Command.Registry` completed registration without 403 Forbidden errors.

### Database Connection Failure
- **Cause**: PostgreSQL or PgBouncer container is not ready, or wrong credentials in `POSTGRES_URL`.
- **Resolution**: Check service health with `docker compose ps`. Ensure your `POSTGRES_URL` points to port `5432` (or `6432` for PgBouncer). Run `bun run db:migrate` to verify schema connectivity.

### Commands Run But AFK / Member Events / Message Triggers Silently Fail
- **Cause**: Missing Privileged Gateway Intents.
- **Resolution**: In the Discord Developer Portal under your application's **Bot** tab, enable:
  1. **Server Members Intent** (`GuildMembers`)
  2. **Message Content Intent** (`MessageContent`)
  Restart the bot after enabling intents.

---

## Web Dashboard Issues

### Login Loop or OAuth2 Redirect Error
- **Cause**: Mismatch between registered redirect URI and the dashboard origin.
- **Resolution**: In the Discord Developer Portal under **OAuth2 → Redirects**, ensure you have added:
  `https://<your-dashboard-domain>/api/auth/callback/discord` (or `http://localhost:8080/api/auth/callback/discord` for local testing).

### Dashboard Loads But Shows No Data / 401 Unauthorized Errors
- **Cause**: The dashboard cannot communicate with the worker RPC server, or `RPC_INTERNAL_TOKEN` does not match between `.env` and the worker.
- **Resolution**: Ensure `apps/worker` is running. In `.env`, set `RPC_INTERNAL_TOKEN` to an identical 32-byte hex string across both worker and dashboard processes.

---

## Addon Issues

### Addon Fails to Load or Commands Are Missing
- **Cause**: Malformed `info.json`, invalid file naming, or unexported `@DefineModule`.
- **Resolution**: Run the addon validator:
  ```bash
  bun run validate ./addons/<addon-name>
  ```
  Fix any flagged errors (such as missing `info.json`, incorrect sub-store folder names like `tasks/` instead of `scheduled-tasks/`, or forbidden cross-module imports).

### Scheduled Tasks Never Fire
- **Cause**: The task folder must be named exactly `scheduled-tasks/`. Folders named `tasks/` or `jobs/` are ignored.
- **Resolution**: Rename to `scheduled-tasks/`, extend `RelayTask`, and register task handlers in your module's `onLoad()` hook using `registerTaskFireHandler`.

