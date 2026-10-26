# Modules

Packages: `@lumi/module-kit` (contracts), `@lumi/module-runtime` (discovery + loader).

## Architecture: Built-in Services vs Toggleable Supermodules

**Built-in Services** (always running, non-disableable):
- `apps/bot/src/core/` — Gateway, sharding, HTTP control server, scheduler, lifecycle
- `apps/bot/src/admin/` — Module management, config, `/lumi` panel, owner commands

**Toggleable Supermodules** (enable/disable per guild via `/lumi` → Modules):
All modules under `modules/` are **supermodules** that contain independently-toggleable **submodules**:

### Utility
- `utility-afk` — AFK status with mention replies and nickname prefix
- `utility-tempvc` — Join-to-create temporary voice channels with ownership controls
- `utility-info` — Avatar, banner, whois, serverinfo, nick, purge

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

## Rules

- Every module under `modules/` is a **supermodule** with submodules in `submodules/`. No regular modules exist.
- Supermodule manifests use `apiVersion: 2` with a `submodules` object.
- Submodules are defined in `submodules/` directories with their own manifest and entry point.
- Submodules declare `requirements: ["supermodule-name"]` to depend on their parent.
- Supermodules are always enabled globally; submodules are enabled/disabled per guild.
- The `/lumi` panel shows supermodules with expandable submodule lists.
- Always-on behaviour lives in `apps/bot/src/` as built-in services, not in a module.
- A module is a directory with `manifest.json` and an entry file.
- Modules may depend on other modules with semver ranges. A dependency cycle
  marks the involved modules broken and skips them; other modules still load.
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
  "entry": "./index.ts",
  "submodules": {
    "afk": {
      "name": "utility-afk",
      "displayName": "AFK",
      "emoji": "💤",
      "description": "Set AFK status with mention replies and nickname prefix",
      "version": "2.0.0",
      "entry": "submodules/afk/index.ts",
      "dependencies": {},
      "requirements": ["utility"],
      "configFields": [],
      "enabledByDefault": true
    },
    "tempvc": { ... },
    "utility": { ... }
  },
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
  "dependencies": {},
  "requirements": ["utility"],
  "conflicts": [],
  "capabilities": [],
  "configFields": [...]
}
```

- `name` must match the submodule directory name and `^[a-z][a-z0-9-]*$`.
- `entry` is relative to the submodule directory (usually `index.ts`).
- `requirements` must include the parent supermodule name.
- Submodules receive `services.supermoduleServices` containing the parent's `sharedServices`.

## Definition

```ts
// Supermodule index.ts
export const UtilitySharedServices = { /* shared internal services */ };

export default defineModule({
  name: "utility",
  displayName: "Utility",
  emoji: "🔧",
  description: "Utility tools: AFK, temporary voice, and info commands",
  version: "2.0.0",
  config: z.object({}),
  configFields: [...], // Supermodule-level config
  commands: [],
  listeners: [],
  tasks: [],
  sharedServices: UtilitySharedServices,
  async onLoad(services) {},
  async onUnload(services) {},
});

// Submodule index.ts (e.g., submodules/afk/index.ts)
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
  async onLoad(services) {
    const { someSharedService } = services.supermoduleServices; // from parent
    ...
  },
});
```

`configFields` is optional display metadata for the `/lumi` module detail panel.
Zod remains the validator; the metadata only chooses the control (`boolean`,
`number`, `string`, `channel`, `role`, `multi-channel`, `multi-role`, `select`, `multi-string`)
and supplies labels. Multi-select fields store `string[]` values and render a role or
channel menu with `minValues: 0`; all other fields open a text modal. The detail
panel renders the first eight metadata rows and up to three select menus
(Discord's action-row and component budget); put the most important settings
first. Modules without metadata still open in the panel but show no editable
settings.

The loader verifies the definition name matches the manifest and that commands and
listeners declare the same module name. It also checks command names,
subcommand names, and autocomplete handlers for uniqueness within the supermodule.

## Loading Order

1. Supermodules load first (topologically sorted by `dependencies`)
2. Supermodule `onLoad` runs, populating `sharedServices`
3. Submodules load (topologically sorted including cross-supermodule deps)
4. Submodules receive `services.supermoduleServices` from their parent

## Panel UI

In `/lumi` → Modules tab:
```
🔧 Utility [▼]
  ├── 💤 AFK          [ON]  [Open]
  ├── 🔊 TempVC       [ON]  [Open]
  └── 🔧 Info Cmds    [ON]  [Open]

👥 Community [▼]
  ├── 📈 Leveling     [ON]  [Open]
  └── 💰 Economy      [ON]  [Open]

🛡️ Moderation [▼]
  └── 🛡️ Moderation   [ON]  [Open]

📝 Logging [▼]
  └── 📝 Logging      [ON]  [Open]

🛡️ Security [▼]
  ├── ☢️ Anti-Nuke    [ON]  [Open]
  ├── 🚪 Join Gate    [OFF] [Open]
  └── ...
```

Clicking ▶/▼ expands/collapses submodules. Clicking "Open" opens the submodule's config panel.
