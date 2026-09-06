# Module system

Feature modules live under `packages/core/src/modules/<name>/`. Each is a Sapphire `Piece`
subclass, discovered and lifecycle-managed by `ModuleStore`
(`packages/core/src/lib/module-system/ModuleStore.ts`), not the vanilla Sapphire piece loader.

## `@DefineModule` and `Module`

`Module.ts:80-109` defines the decorator. It builds a static `meta` object attached to the
class (`(target as any).meta = meta`) and reads real fields from `ModuleOptions`
(`Module.ts:56-74`):

```ts
export interface ModuleOptions extends Piece.Options {
  name?: string;
  displayName?: string;
  emoji?: string;
  description?: string;
  short?: string;
  endUserDataStatement?: string;
  version?: string;
  conflicts?: string[];
  dependencies?: string[];
  configFields?: ConfigField[];
  configSchema?: ModuleConfigSchema;
  configOverrides?: boolean;
  disableable?: boolean;
  category?: string;
  dashboardHref?: string;
}
```

Actual defaults applied in the decorator (`Module.ts:88-104`), not assumptions:

- `name`: `options.name ?? target.name.toLowerCase().replace(/module$/, "")` — a class named
  `EconomyModule` with no explicit `name` would become `"economy"`.
- `displayName`: `options.displayName ?? options.name ?? target.name`.
- `emoji`: `options.emoji ?? Emojis.Gear`.
- `description`: `options.description ?? ""`.
- `version`: `options.version ?? CoreVersion` (the repo's own version, from
  `#utilities/misc.js`) — modules don't usually set this themselves; see `mod`'s
  `manifest.json` pinning `"version": "0.3.0"` while the class itself declares no `version`.
- `disableable`: `options.disableable ?? true`.
- `conflicts` / `dependencies`: default to `[]`.
- `configFields`: derived from `configSchema` via `fieldsFromSchema` if `configFields` isn't
  given directly (almost nothing hand-authors `configFields` — the addon validator warns if
  it finds one, see `agents/architecture/addon-sdk.md`).
- `configOverrides`: `options.configOverrides ?? true`.

Every real module in this repo (`mod`, `logging`, `welcome`, `economy`) uses `configSchema`,
never hand-written `configFields`.

## Lifecycle hooks

`Module` (`Module.ts:115-188`) extends Sapphire's `Piece` and adds four hooks a subclass can
override:

- `onLoad()` — base implementation (`Module.ts:173-183`) fires `reconcileScheduledJobs()`
  fire-and-forget (errors logged, not thrown) and then calls `super.onLoad()`. If you override
  `onLoad`, call `super.onLoad()` at the end or you lose this behavior. `ModModule.onLoad`
  (`modules/mod/index.ts:43-50`) is the canonical example: it registers a config-change hook
  and two task-fire handlers, then returns `super.onLoad()`.
- `onUnload()` — mirror of the above; `ModModule.onUnload` deletes the config-change hook it
  registered on load (`modules/mod/index.ts:52-55`). Any listener/hook a module registers in
  `onLoad` should be torn down here — nothing does this automatically.
- `reconcileScheduledJobs()` — default no-op (`Module.ts:169-171`), called once from `onLoad`.
  Purpose: re-arm delayed BullMQ jobs lost across a restart. `ModModule` overrides it
  (`modules/mod/index.ts:77-88`) to walk `iterateActiveExpiringCases()` and reschedule expiry
  jobs for every still-active case — this is why a mute/ban lift still fires correctly after a
  worker restart even though BullMQ jobs aren't itself the source of truth.
- `deleteUserData(userId, requester?)` / `exportUserData(userId)` — GDPR/CCPA hooks, default
  no-op / `null` (`Module.ts:147-164`). Called by the GDPR pipeline
  (`#lib/gdpr.js`, wired through `global.gdpr.delete` / `global.gdpr.export` RPC actions — see
  `rpc-bridge.md`). `ModModule.exportUserData` (`modules/mod/index.ts:62-75`) redacts
  third-party moderator IDs per GDPR Recital 63 rather than exporting them verbatim — worth
  copying that pattern for any new module whose records reference other users.

If a module declares no user data at all, call the `NoEndUserData()` sentinel for
`endUserDataStatement` (used by `logging` and `dashboard`) rather than leaving it undefined —
it's a documented, explicit "we checked" marker, not the same as omitting the field.

## Sub-store directories and discovery

`KnownSubstores` (`packages/contracts/src/manifest.ts:10-18`):

```ts
export const KnownSubstores = [
  "commands",
  "listeners",
  "interaction-handlers",
  "preconditions",
  "utilities",
  "scheduled-tasks",
  "routes",
] as const;
```

A module's own `manifest.json` `subStores` array is just whichever of these directories
physically exist (`detectSubStores`, `manifest.ts:17-24`) — nothing declares them by hand.
`mod`'s manifest lists `commands`, `listeners`, `interaction-handlers`, `scheduled-tasks`; it
also has `actions/` and `lib/` directories that are *not* in `KnownSubstores` and are just
plain code the module imports internally, not a Sapphire store.

Discovery is driven by `ModuleStore`, not Sapphire's default piece walker
(`ModuleStore.ts:523-556`, `#walk`): it recursively scans each registered root
(`container-services.ts:37-42` registers the core `modules/` dir, the addon
`installed-modules/` symlink dir, and any dev module paths), and for each subdirectory checks
for `manifest.json` first, then an `index.ts`/`index.js`/`index.mts`. A directory with neither
is skipped, one with only `manifest.json` is "manifest-driven" (no code import needed to know
its metadata — used for addons that ship a static manifest), one with only `index.ts` is
"code-driven" (metadata comes from executing `@DefineModule`, i.e. dynamic `import()`).

Loading a module (`loadModule`, `ModuleStore.ts:364-414`) walks every registered Sapphire
store name, and for each one checks whether `<moduleDir>/<storeName>` exists, then loads every
`.ts`/`.js`/`.mts` file under it (skipping files starting with `_` or `.`,
`#walkStoreFiles:491-510`) via that store's own `.load()`. Only after every sub-store piece is
loaded does it load the module's own `index.ts` as the `Module` piece itself
(`ModuleStore.ts:389-399`). A `tasks/` directory (instead of `scheduled-tasks/`) is silently
never scanned — this is exactly what the addon validator flags as an error
(`validate.ts:314-318`).

Dependency ordering and conflict handling are real, not cosmetic: `#topoSort`
(`ModuleStore.ts:660-725`) walks each module's `dependencies` and disables (with a
`failureReason`, never a thrown crash) anything with a missing dependency, a circular
dependency, or a dependency that itself got disabled — the whole dependent chain cascades.
`#applyConflicts` (`ModuleStore.ts:635-647`) disables the *other* module named in `conflicts`
if both would otherwise load, logging a warning; there's no user prompt, first-registered
wins.

## Config schema system

`cfg.*` builders (`packages/core/src/lib/module-system/config-schema.ts:39-156`) wrap
`@sapphire/shapeshift` validators and tag each with UI metadata in a `WeakMap` keyed by the
schema instance itself (`Registry`, line 13) — this is why `fieldsFromSchema` (line 161) can
walk a `cfg.object({...})`'s `.shape` and recover the `ConfigField[]` the dashboard/panel need,
without a parallel manually-kept list.

Every builder validates a shape and renders a specific dashboard/panel widget
(`FieldType` from `packages/contracts/src/config.ts:6-19` — enum members are PascalCase,
their wire values are SCREAMING_SNAKE_CASE strings):

| `cfg.*` builder | Shapeshift validation | `FieldType` member | Wire value |
| --- | --- | --- | --- |
| `cfg.boolean` | `s.boolean()` | `FieldType.Boolean` | `"BOOLEAN"` |
| `cfg.number` | `s.number()` (+ optional `.greaterThanOrEqual`/`.lessThanOrEqual`) | `FieldType.Number` | `"NUMBER"` |
| `cfg.string` | `s.string()` | `FieldType.String` | `"STRING"` |
| `cfg.enum` | `s.enum(choices)` | `FieldType.Enum` | `"ENUM"` |
| `cfg.channel` | snowflake regex `^\d{17,20}$` | `FieldType.Channel` | `"CHANNEL"` |
| `cfg.role` | snowflake regex | `FieldType.Role` | `"ROLE"` |
| `cfg.user` | snowflake regex | `FieldType.User` | `"USER"` |
| `cfg.duration` | regex `^\d+[smhd]$` (e.g. `"5m"`, `"2h"`) | `FieldType.Duration` | `"DURATION"` |
| `cfg.multiRole` | `s.array(snowflake())` | `FieldType.MultiRole` | `"MULTI_ROLE"` |
| `cfg.multiChannel` | `s.array(snowflake())` | `FieldType.MultiChannel` | `"MULTI_CHANNEL"` |
| `cfg.multiUser` | `s.array(snowflake())` | `FieldType.MultiUser` | `"MULTI_USER"` |
| `cfg.stringList` | `s.array(s.string())` | `FieldType.StringList` | `"STRING_LIST"` |

`cfg.number` additionally accepts `step` (renders a range slider instead of a number box,
per the `ConfigField.step` doc comment in `contracts/src/config.ts:31`), and `cfg.channel`/
`cfg.multiChannel` accept `channelTypes: ChannelType[]` to restrict the picker (used
extensively in `logging`'s schema to force `ChannelType.GuildText`). `cfg.duration` accepts
`quickPicks` (e.g. `["1m", "5m", "15m", "1h", "24h"]`, used in `economy`'s payday/slots
cooldowns) which render as preset buttons alongside the free-text duration field.

Every builder also takes `group` (`BaseOpts.group`, `config-schema.ts:26-29`): fields sharing
a `group` string render together as one navigable dashboard subsection. `logging`'s schema
groups fields into `"Setup"` / `"Message Events"` / `"Member Events"`; small modules
(`welcome` uses per-feature groups like `"Welcome Message"`/`"Goodbye Message"`/`"Join
Extras"`) benefit from this, but the doc comment explicitly says to omit `group` for small
modules rather than force one.

`validateModuleConfigValue` (`config-schema.ts:179-187`) is the single point that validates a
raw dashboard/command write against a module's own schema — keys with no declared field
"pass through unchecked" per its own comment, i.e. the module's schema is the sole source of
truth and there's no separate central registry of every possible config key across modules.

## Concrete gotchas (verified in source, not speculation)

- **Piece renaming on construct.** `ModuleStore.construct` (`ModuleStore.ts:353-361`) renames
  every `Module` piece to its record's declared name before Sapphire's `insert()` runs. The
  comment explains why: every module's entry file is `index.ts`, so without this override
  Sapphire's name-collision eviction would unload the *previous* module every time the next
  one's `index.ts` loads.
- **`onLoad` reconciliation is fire-and-forget.** `Module.onLoad`'s call to
  `reconcileScheduledJobs()` is wrapped in `void Promise.resolve(...).catch(...)`
  (`Module.ts:174-181`) — a slow or throwing reconciliation never blocks module load, it just
  logs. Don't assume scheduled jobs are re-armed by the time `onLoad` resolves.
  `apps/worker` code that depends on jobs being armed at boot needs its own wait, not a
  `Module` API.
  Note: `RelayTask` (`packages/core/src/lib/scheduled-tasks.ts:61-72`) is the base class every
  Lumi `ScheduledTask` piece extends — it never does Discord-touching work itself, only
  applies `catchUp` policy (`shouldRunNow`) and republishes onto the scheduler bus for a
  worker's `registerTaskFireHandler` to actually execute. A new scheduled task is therefore
  always a one-line subclass (see `modules/mod/scheduled-tasks/modLift.ts`) plus a handler
  registered in the module's `onLoad`.
- **Disabled ≠ broken but both block dependents.** `#topoSort`'s handling of a disabled
  dependency (`ModuleStore.ts:686-694`) explicitly marks it `broken` (not just skipped) so any
  dependent still consistently reports "unavailable" — the comment calls this out as
  intentional, not a fallthrough bug.
- **Config schema re-import on cache miss.** `getConfigSchema` (`ModuleStore.ts:421-445`)
  caches per-name, but on a cache miss for a manifest-driven (addon) module it dynamically
  `import()`s the module's `indexUrl` just to read its schema — meaning a manifest-only addon
  module still needs its `index.ts` to be import-safe (no side effects it doesn't want run
  twice) even when "manifest-driven" discovery claims to avoid executing code.
- **Services aren't a Sapphire store.** `economy`'s `services/BankService.ts` isn't loaded by
  `ModuleStore` at all — it's plain application code, constructed ad hoc (`new
  BankService()`) from inside commands (`modules/economy/commands/balance.ts:36` etc). Don't
  expect a `services/` directory to be auto-discovered the way `commands/`/`listeners/` are;
  it's a convention, not a `KnownSubstores` entry.
