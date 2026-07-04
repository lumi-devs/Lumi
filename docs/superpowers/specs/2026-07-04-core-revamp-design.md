# Core Revamp — Consistency, /lumi Hub, Addon Dev Kit

Approved 2026-07-04. Order: Phase 1 → 2 → 3, committed per chunk.

## Phase 1 — Consistency

1. **Single-source commands.** `BaseCommand`/`BaseSubcommand` gain
   `prefixEnabled?: boolean` (default `false`). Handlers are written once
   against a `CommandContext` wrapping `ChatInputCommandInteraction | Message`:
   normalized `member`/`guild`/`user`, typed option getters (slash options or
   `Args`), `reply*` helpers (ephemeral on slash, plain reply on prefix),
   `defer()`. Base classes generate the `messageRun`/`chatInputRun` bridges;
   all hand-written `messageRun` duplicates are deleted.
   - Prefix-enabled set: `afk ping ban kick warn timeout cases quarantine
     sanitize`. Everything else slash-only.
2. **Lint-enforced conventions.** ESLint `no-restricted-syntax`/`imports`
   rules ban raw `MessageFlags.Ephemeral`, raw `interaction.reply` in
   commands, `EmbedBuilder`. Existing violations fixed in the same pass.
3. **i18n sweep.** All command strings → typed keys (`commands` namespace),
   `fetchT` + `applyLocalizedBuilder` wired during the rewrite; en-US, de,
   es-ES, fr filled. Key-parity test guards drift.

## Phase 2 — `/lumi` hub panel

One CV2 panel, tab buttons, tabs gated by permission level:
- **Modules** — per-guild enable/disable + status.
- **Config** — existing config-panel views reused inside the hub.
- **Permissions** — rebuilt on native user/role/channel selects (no typed IDs).
- **Settings** — language select + prefix modal (absorbs `/language`, `/prefix`).
- **Addons** (BOT_OWNER) — installed list, update/reload/restart, repos.

`/config`, `/language`, `/permissions` become thin deep-links into their tab.
Selects everywhere; modals only for free text. Custom-id namespace `lumi:`.

## Phase 3 — Addon dev kit

- **Local dev repos**: `/repo add` accepts a filesystem path, gated behind
  `LUMI_DEV_ADDONS=true` + BOT_OWNER. Symlink instead of clone; install/reload
  loop works against the working directory.
- **Validate CLI**: `bun run validate <addon>` — info.json schema,
  `@DefineModule` meta export, `scheduled-tasks/` naming trap, cross-module
  imports, banned patterns, config schema builds. Exit-coded for CI;
  `installModule` runs the same structural checks before loading.

## Testing

Unit tests for `CommandContext` parsing; validate-CLI tests; i18n parity test
extended. Monolith `docker compose up` path untouched.
