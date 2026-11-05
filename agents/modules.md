# Modules

Packages: `@lumi/module-kit` (contracts), `@lumi/module-runtime` (discovery + loader).

## Architecture: Built-in Services vs Toggleable Submodules

**Built-in Services** (always running, non-disableable):

- `src/core/` — Gateway, lifecycle, interaction/prefix dispatch, built-in
  commands, RPC control server, service wiring
- `src/admin/` — Module management, config, `/lumi` panel, owner commands

**Toggleable Modules** (enable/disable per guild via `/lumi` → Modules).
Every module under `modules/` is a **submodule** grouped by a rudimentary
**supermodule** directory. Only submodules are loaded, configured, and
enabled; supermodules are display-only containers.

### Utility

- `utility-afk` — AFK status with mention replies and nickname prefix
- `utility-nick` — Nickname changes with role hierarchy checks and optional self-service
- `utility-tempvc` — Join-to-create temporary voice channels with ownership controls
- `utility-info` — Avatar, banner, whois, serverinfo, and info commands
- `utility-reminders` — Durable DM-first reminders with snooze, recurring schedules, and retention cleanup

### Community

- `community-leveling` — XP, levels, role rewards, leaderboards, voice XP
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

- `moderation-mod` — Case-backed moderation (ban, kick, timeout, warn, purge, notes, lockdown, quarantine, voice mute)

### Logging

- `logging-logs` — Message, edit, delete, voice, and moderation logging

### Security

- `security-core` — Shared security settings (log channel, quarantine role, trusted roles) used by the other security submodules
- `security-antinuke` — Anti-nuke detection with sliding windows, quarantine/ban responses
- `security-join-gate` — On-join security filters: no avatar, min age, unverified bots, advertising, raid detection
- `security-verification` — Member verification with emoji captcha, web verification, pending/verified roles
- `security-panic` — Automated server lockdown, channel locking, invite disabling
- `security-backups` — Periodic server structure snapshots with per-backup stats, safe-repair restore previews (create missing, update existing, never delete), and confirm/reject controls in Discord and the dashboard
- `security-betrayal` — Velocity monitoring of whitelisted users with per-action limits
- `security-autorecovery` — Automatic server restore from latest backup when panic triggers
- `security-automod` — Heat-based automod with 13 filters, escalating punishments, permit-based immunity

## Layout

```
modules/<supermodule>/
├── manifest.json          # group metadata only
└── <submodule>/
    ├── manifest.json
    ├── index.ts
    └── <feature files>
```

There is no `submodules/` container and no `src/` level inside a module. The
loader treats every subdirectory of a supermodule that owns a `manifest.json` as
a submodule, so the filesystem is the single source of truth. The supermodule
directory itself has no entry file and no code.

## Rules

- Every directory under `modules/` is a **supermodule**. No standalone modules
  exist.
- A supermodule is a rudimentary grouping container: a thin `manifest.json` with
  `name`, `displayName`, `emoji`, `description`, and `version`. It has no
  `entry`, no `index.ts`, no `configKey`, no `configFields`, and no
  enable/disable state.
- The loader synthesizes a no-op definition for each supermodule so it can be
  listed for grouping. That synthesized definition is not configurable.
- A supermodule must contain at least one valid submodule. The loader logs an
  error and skips a top-level directory that has no loadable submodules.
- Submodules are the real modules. Each has its own manifest, entry file, code,
  config schema, `configKey`/`configFields` when needed, and per-guild
  enable/disable state.
- Submodules declare `dependencies: { "supermodule-name": "^2.0.0" }` to
  depend on their parent. A dependency outside its semver range skips the
  module; a missing dependency only logs a warning.
- `conflicts` lists module names that cannot coexist. If any listed module is
  available, the loader logs a warning and skips the conflicting module.
- Shared settings live in a normal core submodule, never in the supermodule.
  Examples: `security-core`, `logging-logs`, `role-menus-menu`.
- The `/lumi` panel shows supermodules as headers with enabled counts and lists
  their submodules as configurable, toggleable rows.
- Always-on behaviour lives in `src/` as built-in services, not in a module.
- Modules may depend on other modules with semver ranges. The loader checks the
  dependency's version and skips a module when it falls outside the declared
  range; a missing dependency is logged and the module still loads. A dependency
  cycle marks the involved modules broken and skips them; other modules still
  load.
- Modules never import another module. Shared code goes into a package.
- Modules reach persistence and cache only through `services.helpers`; direct
  imports of `@prisma/client`, `@lumi/db`, `@lumi/cache`, `@lumi/redis`, or
  `ioredis` are rejected for `modules/**`.
- Module code receives `ModuleServices`, never the wide `BotServices`. See
  [services.md](./services.md) for the two contracts and the projection rule.

## Supermodule Manifest

```json
{
  "apiVersion": 2,
  "name": "utility",
  "displayName": "Utility",
  "emoji": "🔧",
  "description": "Utility tools: AFK, temporary voice, and info commands",
  "version": "2.0.0"
}
```

A supermodule manifest must not declare `entry`, `dependencies`,
`requirements`, `conflicts`, `capabilities`, `configKey`, or `configFields`.
Those belong to submodules.

## Submodule Manifest

```json
{
  "apiVersion": 2,
  "name": "utility-afk",
  "displayName": "AFK",
  "emoji": "💤",
  "description": "Set AFK status with mention replies and nickname prefix",
  "version": "2.0.0",
  "entry": "index.ts",
  "dependencies": { "utility": "^2.0.0" },
  "requirements": [],
  "conflicts": [],
  "capabilities": [],
  "configFields": [...]
}
```

- `name` must match `^[a-z][a-z0-9-]*$`. Supermodule names match their
  top-level directory; submodule names are `<supermodule>-<directory>` (for
  example `utility-afk` in `utility/afk/`).
- `entry` is required for submodules and is relative to the submodule directory
  (usually `index.ts`). It is optional in the manifest schema only so that
  rudimentary supermodule manifests can omit it; the loader ignores any
  supermodule entry.
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
// Submodule index.ts
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

Supermodules have no definition file. The loader synthesizes a no-op container
definition from their thin manifest.

`configFields` lives only in a **submodule** `manifest.json`, never in
`defineModule` or in a supermodule manifest. It is optional display metadata for
the `/lumi` submodule detail panel. Zod remains the validator; the metadata only
chooses the control (`boolean`, `number`, `string`, `channel`, `role`,
`multi-channel`, `multi-role`, `json`, `select`, `multi-string`, `escalation`)
and supplies labels. A field with `choices` renders a string select; channel and
role fields render pickers; multi-select fields store `string[]` values and
render a menu with `minValues: 0`; `escalation` renders warning-count rules with
an action picker and optional timeout duration in the `/lumi` panel and
dashboard; everything else opens a text modal. Fields may declare a
`category`; the panel groups settings by category and labels each page with it
instead of using numbered settings pages. The detail panel renders up to four
settings per page. Submodules without metadata still open in the panel but show
no editable settings.

A submodule manifest may set `configKey` when its stored settings key differs
from its module name. The panel reads and writes that key, so module code and the
panel must use the same key. Examples: `community-leveling` stores its settings
under `leveling`, `security-core` under `security-core`, `logging-logs` under
`logging-logs`, and `role-menus-menu` under `role-menus-menu`.

The loader verifies the definition `name` matches the manifest. The host
attaches every command to its owning module; a command name that collides with
an already-registered command is skipped with a warning. Listeners do not
declare a module name.

## Loading Order

1. The loader discovers supermodule containers from their thin manifests and
   registers synthetic no-op definitions for grouping
2. Submodule definitions load (topologically sorted by `dependencies`, including
   cross-supermodule deps)

## Panel UI

In `/lumi` → Modules tab:

```
🔧 Utility                         3/5 enabled
👥 Community                       1/4 enabled
🛡️ Security                        2/9 enabled
```

Supermodule headers are not configurable and have no toggle. Opening a
supermodule lists its submodules as rows with `Enabled`/`Disabled` status, a
settings button, and a toggle. Settings pages are grouped and labelled by
`category`; pagination stays inside a category when it has too many fields.
Disabling a submodule immediately resyncs that guild's slash commands and stops
its listeners from running in that guild.
