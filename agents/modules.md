# Modules

Packages: `@lumi/module-kit` (contracts), `@lumi/module-runtime` (discovery + loader).

## Architecture: Built-in Services vs Toggleable Supermodules

**Built-in Services** (always running, non-disableable):
- `src/core/` — Gateway, sharding, HTTP control server, scheduler, lifecycle
- `src/admin/` — Module management, config, `/lumi` panel, owner commands

**Toggleable Supermodules** (enable/disable per guild via `/lumi` → Modules).
Every module under `modules/` is a **supermodule** that contains independently-toggleable **submodules**:

### Utility
- `utility-afk` — AFK status with mention replies and nickname prefix
- `utility-nick` — Nickname changes with role hierarchy checks and optional self-service
- `utility-tempvc` — Join-to-create temporary voice channels with ownership controls
- `utility-info` — Avatar, banner, whois, serverinfo, and info commands

### Community
- `community-leveling` — XP, levels, role rewards, leaderboards, voice XP
- `community-economy` — Currency, banking, shop, jobs, gambling, balance cards

### Moderation
- `moderation-mod` — Case-backed moderation (ban, kick, timeout, warn, purge, notes, lockdown, quarantine, voice mute)

### Logging
- `logging-logs` — Message, edit, delete, voice, and moderation logging

### Security
- `security-antinuke` — Anti-nuke detection with sliding windows, quarantine/ban responses
- `security-join-gate` — On-join security filters: no avatar, min age, unverified bots, advertising, raid detection
- `security-verification` — Member verification with emoji captcha, web verification, pending/verified roles
- `security-panic` — Automated server lockdown, channel locking, invite disabling
- `security-backups` — Periodic server structure snapshots for auto-recovery and manual restore
- `security-betrayal` — Velocity monitoring of whitelisted users with per-action limits
- `security-autorecovery` — Automatic server restore from latest backup when panic triggers
- `security-automod` — Heat-based automod with 13 filters, escalating punishments, permit-based immunity

## Layout

```
modules/<supermodule>/
├── manifest.json
├── index.ts
└── <submodule>/
    ├── manifest.json
    ├── index.ts
    └── <feature files>
```

There is no `submodules/` container and no `src/` level inside a module. The
loader treats every subdirectory of a supermodule that owns a `manifest.json` as
a submodule, so the filesystem is the single source of truth.

## Rules

- Every module under `modules/` is a **supermodule**. No regular modules exist.
- A supermodule is a directory with `manifest.json` and an entry file; its
  submodules are sibling directories, each with their own `manifest.json` and entry.
- Submodules declare `dependencies: { "supermodule-name": "^2.0.0" }` to
  depend on their parent.
- Supermodules are always enabled globally; submodules are enabled/disabled per guild.
- The `/lumi` panel shows supermodules with expandable submodule lists.
- Always-on behaviour lives in `src/` as built-in services, not in a module.
- Modules may depend on other modules with semver ranges. The loader checks the
  dependency's version and skips a module when it falls outside the declared
  range; a missing dependency is logged and the module still loads. A dependency
  cycle marks the involved modules broken and skips them; other modules still
  load.
- Modules never import another module. Shared code goes into a package.

## Supermodule Manifest

```json
{
  "apiVersion": 2,
  "name": "utility",
  "displayName": "Utility",
  "emoji": "🔧",
  "description": "Utility tools: AFK, temporary voice, and info commands",
  "version": "2.0.0",
  "entry": "index.ts",
  "dependencies": {},
  "requirements": [],
  "conflicts": [],
  "capabilities": [],
  "configFields": []
}
```

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

- `name` must match the submodule directory name and `^[a-z][a-z0-9-]*$`.
- `entry` is relative to the module directory (usually `index.ts`).
- `capabilities` is descriptive metadata only. The loader validates its shape
  but does not act on it; loading is gated by `dependencies` and `conflicts`.

## Definition

```ts
// Supermodule index.ts
export default defineModule({
  name: "utility",
  displayName: "Utility",
  emoji: "🔧",
  description: "Utility tools: AFK, temporary voice, and info commands",
  version: "2.0.0",
  config: z.object({}),
  configFields: [],
  commands: [],
  listeners: [],
  tasks: [],
  async onLoad(services) {},
  async onUnload(services) {},
});

// Submodule index.ts
export default defineModule({
  name: "utility-afk",
  displayName: "AFK",
  emoji: "💤",
  description: "Set AFK status with mention replies and nickname prefix",
  version: "2.0.0",
  config: z.object({ ... }),
  configFields: [...],
  commands: [afkCommand],
  listeners: [afkMessageListener],
  async onLoad(services) {},
  async onUnload(services) {},
});
```

`configFields` is optional display metadata for the `/lumi` module detail panel.
Zod remains the validator; the metadata only chooses the control (`boolean`,
`number`, `string`, `channel`, `role`, `multi-channel`, `multi-role`, `select`, `multi-string`)
and supplies labels. Multi-select fields store `string[]` values and render a role or
channel menu with `minValues: 0`; all other fields open a text modal. Fields may
declare a `category`; the panel groups settings by category and labels each page
with it instead of using numbered settings pages. The detail panel renders up to
four settings per page. Modules without metadata still open in the panel but show
no editable settings.

A manifest may set `configKey` when its stored settings key differs from its
module name. The panel reads and writes that key, so module code and the panel
must use the same key. For example, `community-leveling` stores its settings
under `leveling`, and `utility-afk` stores them under `afk`.

The loader verifies the definition name matches the manifest and that commands and
listeners declare the same module name. It also checks command names,
subcommand names, and autocomplete handlers for uniqueness within the supermodule.

## Loading Order

1. Supermodules load first (topologically sorted by `dependencies`)
2. Submodules load (topologically sorted including cross-supermodule deps)

## Panel UI

In `/lumi` → Modules tab:
```
🔧 Utility                         Enabled   [Submodules]
👥 Community                       Enabled   [Submodules]
🛡️ Security                        Enabled   [Submodules]
```

Opening a supermodule lists its submodules as rows with `Enabled`/`Disabled`
status, a settings button, and a toggle. Settings pages are grouped and labelled
by `category`; pagination stays inside a category when it has too many fields.
Disabling a module immediately resyncs that guild's slash commands and stops its
listeners from running in that guild.
