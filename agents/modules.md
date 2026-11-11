# Modules

Packages: `@lumi/module-kit` (contracts), `@lumi/module-runtime` (discovery + loader).

## Architecture: Built-in Services vs Toggleable Modules

**Built-in Services** (always running, non-disableable):

- `src/core/` — Gateway, lifecycle, interaction/prefix dispatch, built-in
  commands, RPC control server, service wiring
- `src/admin/` — Module management, config, `/lumi` panel, owner commands

**Toggleable Modules** (enable/disable per guild via `/lumi` → Modules).
Every nested directory under `modules/` with a `manifest.json` is one module
with its own entry file. Bundled modules and add-ons share one contract; the
only difference is their discovery root (`modules/` vs `data/addons/`) and
`origin`.

### Utility

- `utility-afk` — AFK status with mention replies and nickname prefix
- `utility-nick` — Nickname changes with role hierarchy checks and optional self-service
- `utility-tempvc` — Join-to-create temporary voice channels with ownership controls. Creation, expiry refresh, and sweep deletion serialize on a per-channel lock so two joins cannot create duplicate channels and a rejoin cannot race an expired-channel delete.
- `utility-info` — Avatar, banner, whois, serverinfo, and info commands
- `utility-reminders` — Durable DM-first reminders with snooze, recurring schedules, and retention cleanup

### Community

- `community-leveling` — XP, levels, role rewards, leaderboards, voice XP. Level writes advance monotonically through a conditional update, so a delayed XP calculation cannot lower a level or repeat a level-up reward.
- `community-economy` — Currency, banking, rewards, shop, balance cards
- `community-quote` — `/quote` plus `,quote`/`,q` prefix quotes, with optional quote channel, dark/color theme, watermark, name/avatar source, markdown stripping, and mention resolution
- `community-stats` — Message, voice, member, status, and boost tracking with canvas cards, 10-minute snapshots, and a 90-day raw-data retention cap
- `community-tickets` — Private-thread ticket panels, categories, claims, priorities, notes, tags, feedback, and HTML transcripts

### Custom Commands

- `custom-commands-core` — Guild-authored Mustache-style commands with triggers, KV, cron/interval schedules, and card responses

### Role Menus

- `role-menus-menu` — Button, select, and reaction role menus with single/multiple modes and temporary roles

### Roles

- `roles-autorole` — Join autoroles with delays and filters
- `roles-voiceroles` — Per voice/stage channel roles with grace periods
- `roles-bulkrole` — Resumable bulk add/remove role jobs with filters and dry runs

### Moderation

- `moderation-mod` — Case-backed moderation (ban, kick, timeout, warn, purge, notes, lockdown, quarantine, voice mute); destructive actions require the actor's highest role to outrank the target (guild owner bypasses, Administrators do not)

### Logging

- `logging-logs` — Message, edit, delete, voice, and moderation logging. Message
  content is placed in dynamic-length code fences and user/author mentions are
  inline-coded so stored text cannot inject formatting, links, or spoilers.

### Security

- `security-core` — Shared security settings (log channel, quarantine role, trusted roles) used by the other security modules
- `security-antinuke` — Anti-nuke detection with sliding windows, quarantine/ban responses
- `security-join-gate` — On-join security filters: no avatar, min age, unverified bots, advertising, raid detection
- `security-verification` — Member verification with emoji captcha, web verification, pending/verified roles
- `security-panic` — Automated server lockdown, channel locking, invite disabling
- `security-backups` — Periodic server structure snapshots with per-backup stats, safe-repair restore previews (create missing, update existing, never delete), and confirm/reject controls in Discord and the dashboard. Restore preflights the bot member and Manage Roles/Manage Channels before mutating; partial failures return warnings and are shown as a warning card and security log instead of a success message.
- `security-betrayal` — Velocity monitoring of whitelisted users with per-action limits
- `security-autorecovery` — Automatic server restore from latest backup when panic triggers
- `security-automod` — Heat-based automod with 13 filters, escalating punishments, permit-based immunity

## Layout

```
modules/<category>/<module>/
├── manifest.json
├── index.ts
└── <feature files>
```

Category directories are optional and purely organisational: they have no
manifest. The loader walks nested directories (up to four levels), and every
directory containing a `manifest.json` is one module. A module directory name
does not need to match `manifest.name`; the manifest name is the unique module
name and MUST match the definition `name`. Module names stay globally unique
even when their directories are grouped.

`modules/shared/` is a helper directory without a manifest; it is not loaded as
a module.

## Rules

- Any nested directory under `modules/` with a `manifest.json` is a module.
  `origin` is `bundled`; add-ons discovered under `data/addons/` are `addon`.
  Duplicate manifest names are rejected; the first discovered module wins.
- Each module has its own manifest, entry file, code, config schema,
  `configKey`/`configFields` when needed, and per-guild enable/disable state.
- The definition `name` MUST match `manifest.name`. The manifest `entry` is
  required.
- Modules declare `dependencies` with semver ranges. A dependency outside its
  semver range skips the module; a missing dependency only logs a warning.
- `conflicts` lists module names that cannot coexist. If any listed module is
  available, the loader logs a warning and skips the conflicting module.
- Shared settings live in a normal module. Examples: `security-core`,
  `logging-logs`, `role-menus-menu`.
- The `/lumi` Modules tab lists bundled modules only, grouped by the optional
  manifest `category` (falling back to `Other`). Add-ons appear in the Add-ons
  tab and never in the Modules tab.
- Always-on behaviour lives in `src/` as built-in services, not in a module.
- Modules may depend on other modules with semver ranges. The loader checks the
  dependency's version and skips a module when it falls outside the declared
  range; a missing dependency is logged and the module still loads. A dependency
  cycle marks the involved modules broken and skips them; other modules still
  load.
- Modules never import another module. Shared code goes into a package or
  `modules/shared/`.
- Modules reach persistence and cache only through `services.helpers`; direct
  imports of `@prisma/client`, `@lumi/db`, `@lumi/cache`, `@lumi/redis`, or
  `ioredis` are rejected for `modules/**`.
- Use `services.helpers.moduleData` for generic per-guild module key/value or
  JSON state instead of adding a table per feature. See
  [module-data.md](./module-data.md).
- Module code receives `ModuleServices`, never the wide `BotServices`. See
  [services.md](./services.md) for the two contracts and the projection rule.

## Stored Regex Safety

Stored patterns from automod `regexRules`, join-gate `filterUsernamePatterns`,
ticket auto-tags, and custom-command `regex` triggers are untrusted. They are
compiled with `compileSafeRegex` (`modules/shared/regex.ts`), which limits length
to 200 characters and rejects backreferences, lookbehind, nested repetition, and
repeated alternation. Runtime matching is fail-closed through `safeRegexTest`.

A pattern that fails compilation is ignored for that evaluation and logged once
per guild, field, pattern, and error by `warnInvalidRegexPatterns`
(`modules/shared/regex-warnings.ts`). Never reject the whole module config or
fall back to `enabled: false` because one stored pattern is unsafe; that would
disable protection for every other rule. The dashboard applies the same checks
before saving multi-string `regexRules` and `filterUsernamePatterns` values, but
other config writers still bypass the UI, so module read paths must warn and
filter as well.

## Manifest

```json
{
  "apiVersion": 2,
  "name": "utility-afk",
  "displayName": "AFK",
  "emoji": "💤",
  "description": "Set AFK status with mention replies and nickname prefix",
  "version": "2.0.0",
  "category": "Utility",
  "entry": "index.ts",
  "dependencies": { "utility-info": "^2.0.0" },
  "requirements": [],
  "conflicts": [],
  "capabilities": [],
  "configFields": []
}
```

- `name` must match `^[a-z][a-z0-9-]*$` and the definition `name`. It is the
  globally unique module name, independent of the directory it lives in.
- `entry` is required and relative to the module directory (usually `index.ts`).
- `category` is optional (1–32 characters). It groups bundled modules in the
  `/lumi` Modules tab and dashboard.
- `capabilities` is descriptive metadata only. Each entry is
  `{ "name": "...", "version": "...", "provides": ["..."] }`; the loader
  validates its shape but does not act on it. Expose shared module APIs here so
  consumers can depend on named capabilities later.
- Bundled modules share the root `package.json` runtime dependencies, matching
  Redbot's central cogs. `requirements` is for downloadable add-ons; the
  add-on downloader installs those specs into the add-on directory.
- `community-quote` intentionally declares `makeitaquote` in its manifest
  `requirements` as a working example of the field. Because it is a bundled
  module, the downloader does not install it automatically; use
  `bun add --no-save --ignore-scripts makeitaquote@^12.1.6` for local
  development. The command replies with a clear error when the requirement is
  missing. Rendering is local, so no external image API is involved.

## Definition

```ts
// index.ts
export default defineModule({
  name: "utility-afk",
  displayName: "AFK",
  emoji: "💤",
  description: "Set AFK status with mention replies and nickname prefix",
  version: "2.0.0",
  config: z.object({ ... }),
  commands: [afkCommand],
  listeners: [afkMessageListener],
  async onLoad(services) {},
  async onUnload(services) {},
});
```

`configFields` lives in `manifest.json`, never in `defineModule`. It is optional
display metadata for the `/lumi` module detail panel. Zod remains the validator;
the metadata only chooses the control (`boolean`, `number`, `string`, `channel`,
`role`, `multi-channel`, `multi-role`, `json`, `select`, `multi-string`,
`escalation`) and supplies labels. A field with `choices` renders a string
select; channel and role fields render pickers; multi-select fields store
`string[]` values and render a menu with `minValues: 0`; `escalation` renders
warning-count rules with an action picker and optional timeout duration in the
`/lumi` panel and dashboard; everything else opens a text modal. Fields may
declare a `category`; the panel groups settings by category and labels each page
with it instead of using numbered settings pages. The detail panel renders up to
four settings per page. Modules without metadata still open in the panel but
show no editable settings.

A manifest may set `configKey` when its stored settings key differs from its
module name. The panel reads and writes that key, so module code and the panel
must use the same key. Examples: `community-leveling` stores its settings under
`leveling`, `security-core` under `security-core`, `logging-logs` under
`logging-logs`, and `role-menus-menu` under `role-menus-menu`.

The loader verifies the definition `name` matches the manifest. The host
attaches every command to its owning module; a command name that collides with
an already-registered command is skipped with a warning. Listeners do not
declare a module name.

## Loading Order

1. The loader walks nested directories, reads every `manifest.json`, requires
   the manifest and definition names to match, and imports the entry.
2. Definitions load (topologically sorted by `dependencies`).

## Panel UI

In `/lumi` → Modules tab, bundled modules are listed one paginated list grouped
by `manifest.category ?? "Other"`:

```
Utility
💤 AFK — Enabled
Community
📈 Leveling — Disabled
```

Opening a module shows its settings and an enable/disable toggle. Settings pages
are grouped and labelled by `category`; pagination stays inside a category when
it has too many fields. Disabling a module immediately resyncs that guild's
slash commands and stops its listeners from running in that guild.

Add-ons are managed under `/lumi` → Add-ons. Installed add-ons can open the same
settings panel and toggle their guild state, but they never appear in the
Modules tab.
