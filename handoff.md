# Lumi v2 — Handoff Summary

**Branch:** `v2/develop`  
**Working directory:** `/home/rebiz/opt/workdir/lumi-v2`  
**Last sync:** 2026-11-03 (typecheck, lint, 389 tests pass / 10 skipped; bot registers 51 guild commands)

---

## What Was Completed

### 1. Supermodule / Submodule Refactor (Core Architecture)

- Supermodules are now **thin metadata-only groups** (no entry, no config, no toggle state).
- Submodules own their config, enable state, and code.
- Shared settings consolidated into core submodules:
  - `security-core` — log channel, quarantine role, trusted roles
  - `logging-logs` — logging channels
  - `role-menus-menu` — role menu settings

### 2. Security Backups (Safe-Repair Restore)

- **Schema expanded** in `modules/security/backup-store.ts`:
  - Role colors + Unicode emoji
  - All Discord channel types: voice, stage, forums, media, announcements, text, categories
  - Hidden/synced permissions, forum tags, default reactions, sort/layout
  - Auto-archive, thread slowmode, RTC region, video quality, flags
- **Safe-repair restore** (`previewBackupRestore`, `restoreBackup`):
  - Creates missing roles/channels
  - Updates existing names, positions, permissions, topics
  - **Never deletes** anything
- Older v1 backups still restore (new fields optional)
- `backupStats()` helper for per-backup stats shown in list

### 3. `/backup` Command + Discord Hub

- **List** shows stats (roles, channels, categories, overwrites, etc.)
- **Preview** shows diffs (create/update counts, unchanged counts, warnings)
- **Confirm/Reject** buttons on both Discord and Dashboard
- Button listener handles the flow end-to-end

### 4. Dashboard Security Page

- Backup list table with stats
- Restore preview panel with diffs and warnings
- **Confirm Restore** / **Reject** actions + audit logging

### 5. Module Toggles — Live via RPC (No Page Reload)

- New RPC endpoint: `POST /api/v1/guilds/:id/modules/:module/state`
- Dashboard uses `use:enhance` for optimistic UI updates
- Bot applies state immediately; commands/listeners respect it without restart
- If bot unreachable → warning toast, change applies on next sync

### 6. Collapsible Supermodules (Dashboard)

- Default **collapsed** on load
- Expand/Collapse button per group
- **No dangling separator** when collapsed (border only on `.expanded`)

### 7. Discord Hub Submodule List

- Uses `settingRow` sections with inline **Open** button next to module name
- Matches `./lumi` style
- Enable/Disable moved to module detail view (compact labels)

### 8. Permit Explain Flow

- **Auto-runs** on member selection (user select menu)
- **Removed** "Run Check" button
- "Check Another" button returns to selector

### 9. Addon External Dependency Validation

- `packages/downloader/tests/validate.test.ts`:
  - Accepts declared npm `requirements` (e.g., `lodash@^4.17.21`)
  - Rejects invalid registry specs (e.g., `../local-package`)
  - Rejects undeclared third-party imports
- Fixed `supermoduleManifestFields()` in `packages/module-runtime/src/manifest.ts` to allow `requirements` on addon manifests (previously flagged as thick-field violation)
- All 10 validation tests now pass

### 10. Database Helpers + Module Data Lifecycle

- `@lumi/db` now exports `createDbHelpers(redis)` with `leveling`, `economy`,
  `stats`, `tickets`, `roleMenus`, `customCommands`, `roles`, `security`,
  `verification`, `utility`, and `cache` namespaces.
- Every module and add-on reads/writes through `services.helpers`; Biome blocks
  `@prisma/client`, `@lumi/db`, `@lumi/cache`, `@lumi/redis`, and `ioredis`
  imports under `modules/**`.
- `services.helpers.cache` wraps Redis (`get`, `set`, `del`, `getOrLoad`,
  `setNx`, counters, sets, locks) with single-flight loads.
- `ModuleDefinition.dataLifecycle` hooks aggregate user export/deletion across
  modules; `/owner privacy_export` and `/owner privacy_delete` call them.
- Owner operations also cover server list/leave, guild/user blacklists, config
  export/import, and error trace lookup.

### 11. Discord Role Management Panels + `/config`

- New `/config module:<submodule>` command (admin/permit-gated, ephemeral) with
  submodule autocomplete; opens the shared module detail panel.
- `/autorole`, `/voiceroles`, and `/rolemenu` are no longer registered as slash
  commands. Their definitions are `prefixOnly`, so the prefix commands still
  work; `/bulkrole` remains a slash command.
- Full ephemeral management panels:
  - Autorole: role picker, delay, filters (min account age, required/ignored
    roles, ignore bots, only-on-join), run/pause/cancel queue, queue member.
  - Voice roles: paginated mapping list, add (channel → optional category →
    role), enable/disable, grace, category change, remove.
  - Role menus: paginated groups, create/edit, add/remove options, toggles,
    buttons/select/reaction posting, refresh, delete.
- `ModuleServices` now includes `helpers`; admin `HubServices` includes `client`
  and `helpers`.
- Slash sync payload filters `prefixOnly` commands via
  `commandPayloadForGuild`/`commandPayloads`.

### 12. Documentation Updates

- `agents/db.md` — helper tree, module access rules, migration commands
- `agents/cache.md` — `services.helpers.cache` contract
- `agents/module-dev-guide.md`, `agents/addon-dev-guide.md`,
  `agents/commands.md`, `agents/architecture.md`, `agents/migration-guide.md` —
  removed direct Prisma/Redis service examples

---

## Key Files Changed (Recent)

| Area                                         | Files                                                                      |
| -------------------------------------------- | -------------------------------------------------------------------------- |
| Backup store / restore                       | `modules/security/backup-store.ts`                                         |
| `/backup` command                            | `modules/security/backups/index.ts`                                        |
| RPC routes (new module-state endpoint)       | `src/core/rpcRoutes.ts`                                                    |
| Bot wiring                                   | `src/index.ts`                                                             |
| Dashboard RPC client                         | `apps/dashboard/src/lib/server/rpc.ts`                                     |
| Dashboard module list (collapsible, enhance) | `apps/dashboard/src/routes/guilds/[guildId]/modules/+page.svelte`          |
| Dashboard module list (server)               | `apps/dashboard/src/routes/guilds/[guildId]/modules/+page.server.ts`       |
| Dashboard module detail (enhance)            | `apps/dashboard/src/routes/guilds/[guildId]/modules/[module]/+page.svelte` |
| `/config` + slash filtering                  | `src/admin/commands/index.ts`, `src/core/modules.ts`                       |
| Role management panels                       | `src/admin/panel/roles.ts`, `HubPanel.ts`, `moduleSettings.ts`, `moduleActions.ts` |
| Prefix-only command flags                    | `modules/roles/**`, `modules/role-menus/menu/commands.ts`, `packages/module-kit` |
| Discord hub module list                      | `src/admin/panel/moduleList.ts`                                            |
| Permit explain (auto-run)                    | `src/admin/panel/permit/explainActions.ts`, `assignViews.ts`               |
| Downloader validation tests                  | `packages/downloader/tests/validate.test.ts`                               |

---

## Running Services (Current)

```bash
# Bot (watch mode, auto-reloads)
bun --watch src/index.ts
# → RPC on 127.0.0.1:8091
# → Logs: /tmp/lumi-bot.log

# Dashboard (dev)
cd apps/dashboard && bun run dev
# → http://localhost:4173

# Test guild
1466696760897572906
```

---

## Verification Commands

```bash
# Typecheck (root + dashboard)
nix develop --command bun run typecheck
cd apps/dashboard && nix develop --command bun run typecheck

# Tests
nix develop --command bun run test

# Build dashboard
cd apps/dashboard && nix develop --command bun run build

# Lint
nix develop --command bunx biome check .
```

---

## Known Gaps / Next Up

1. **Full E2E verify** of backup restore from Discord + Dashboard (smoke test on test guild)
2. **Addon conflict rejection path** — could add an integration test installing two conflicting addons
3. **Dashboard health indicator** — show RPC connectivity status in footer (optional)
4. **Voice roles UI** — config page exists; confirm `/voiceroles add` works end-to-end (already implemented)
5. **Addon `requirements` field** — all submodule manifests include `requirements: []` for declaring npm dependencies; document expected format (registry semver specs only, e.g., `lodash@^4.17.21`) and that `bun add --production --ignore-scripts --no-save` is used at install time

---

## Environment Notes

- `.env` has `DATABASE_URL`, `RPC_INTERNAL_TOKEN`, `RPC_URL` (dashboard)
- PostgreSQL + Redis required for bot; dashboard only needs RPC + DB for auth/audit
- `SecurityBackup.data` is Prisma JSON with `version: 1`, `roles[]`, `channels[]`; new fields optional
- Dashboard cannot import bot modules — backup stats computed locally from stored JSON
