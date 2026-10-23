# Modules

Packages: `@lumi/module-kit` (contracts), `@lumi/modules` (discovery + loader).

## Rules

- Every module is toggleable. No module is privileged, essential, or undeletable.
- Always-on behaviour lives in `apps/bot/src/app.ts` and built-in commands, not in
  a module.
- A module is a directory with `manifest.json` and an entry file.
- Modules may depend on other modules with semver ranges. A dependency cycle
  marks the involved modules broken and skips them; other modules still load.
- Modules never import another module. Shared code goes into a package.

## Manifest

`packages/modules/src/manifest.ts` validates:

```json
{
  "apiVersion": 2,
  "name": "afk",
  "displayName": "AFK",
  "emoji": "💤",
  "description": "Set yourself AFK.",
  "version": "0.1.0",
  "entry": "./index.ts",
  "dependencies": { "leveling": "^0.1.0" },
  "requirements": ["lodash@^4.17.21"],
  "conflicts": [],
  "capabilities": []
}
```

- `name` must match the directory name and `^[a-z][a-z0-9-]*$`.
- `entry` must be relative and stay inside the module. Both `apiVersion: 2` and
  `entry` are required.
- `minBotVersion` / `maxBotVersion` are enforced by the loader.
- `dependencies` means **other modules** and their semver ranges.
- `requirements` means **npm packages**, as registry semver specs
  (`name`, `name@^1.2.3`, `@scope/name@~2.0.0`). They are installed with
  `bun install --production --ignore-scripts --no-save` inside the addon version
  directory. No addon `package.json` dependency section is read or allowed.

## Definition

```ts
export default defineModule({
  name: "afk",
  displayName: "AFK",
  emoji: "💤",
  description: "Set yourself AFK.",
  config: z.object({ nick_prefix_enabled: z.boolean().default(true) }),
  configFields: [
    {
      key: "nick_prefix_enabled",
      label: "Nickname Prefix",
      type: "boolean",
      description: "Prefix nicknames while a member is away.",
    },
  ],
  commands: [afkCommand],
  listeners: [afkMessageListener],
  onLoad(services) {},
  onUnload(services) {},
});
```

`configFields` is optional display metadata for the `/lumi` module detail panel.
Zod remains the validator; the metadata only chooses the control (`boolean`,
`number`, `string`, `channel`, `role`, `multi-channel`, `multi-role`) and
supplies labels. Multi-select fields store `string[]` values and render a role or
channel menu with `minValues: 0`; all other fields open a text modal. The detail
panel renders the first eight metadata rows and up to three select menus
(Discord's action-row and component budget); put the most important settings
first. Modules without metadata still open in the panel but show no editable
settings.

The loader verifies the definition name matches the manifest and that commands and
listeners declare the same module name. It also checks command names,
descriptions, unique names within the module, and that a provided builder reports
the same name. Module commands may not collide with built-in command names
(`reservedCommands`). It calls `onLoad`, wires listeners, registers commands, and
tracks disposers.

## Lifecycle

- `load()` — unload existing records, discover roots, validate, topologically
  sort, skip disabled modules, import entries.
- `reload(name)` — unload, re-read the manifest, import with a cache-busting query.
- `setEnabled(name, enabled)` — persists the global state and loads/unloads.
- `unload(name)` — remove listeners, commands, then `onUnload`.
- `unloadAll()` — reverse order.
- `onChange` (loader option) runs after load/reload/enable/disable/uninstall. The
  app uses it to re-register slash commands; it is skipped before the client is
  ready.

## Roots

- Bundled: `apps/bot/src/modules/` (origin `bundled`).
- Addons: `data/addons/` (origin `addon`).

Both go through the same validation, discovery, and lifecycle. There is no
separate addon loading path. A bundled and an addon module cannot share a name;
the bundled module wins and the addon is reported broken. Do not install an addon
under a bundled module name.

Module listeners run while the module is globally loaded. A guild can still
disable the module, so listeners that act on guild events must check
`services.modules.isEnabled(guildId, name)` before doing work.

## Guild enablement

`services.modules.isEnabled(guildId, module)` is the only gate. Built-in commands
(`module: null`) bypass it. Enablement is global state AND guild state; there is
no `config.enabled` key.

## Bundled modules

- `mod` — case-backed moderation. Undo operations deactivate the matching active
  cases (`untimeout` lifts `mute`, `/quarantine remove` lifts `quarantine`,
  `/vcmute remove` lifts `voice_mute`). `/unban` and softban intentionally leave
  the original case active, matching v1. `warn_thresholds` is a JSON map of warn
  count to `{ action, duration }`; `immune_role_ids` skips automated threshold
  actions. The expiry sweep lifts expired `voice_mute` cases once the member is
  in voice, and the voice-state listener re-applies an active mute on rejoin.
  Voice mutes use Discord's server mute rather than disconnecting the member.
- `security` — verification and panic. Verification mode is `emoji` or `none`;
  the pending-role sweep kicks unverified members when configured. `/verifypanel`
  posts or refreshes the persisted panel, and `/panic` snapshots the previous
  @everyone send permission so the revert button can restore it.
- `utility` — avatar, banner, whois, serverinfo, nick, and purge.
- `afk` — AFK entries and mention replies.
