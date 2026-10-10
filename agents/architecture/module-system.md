# Module system

Feature modules live under `packages/core/src/modules/<name>/`. Each exports
a `defineModule({...})` object (`ModuleObject`,
`packages/core/src/lib/module-system/module.ts:19-103`) — no classes, no
decorators (the class API is removed; the addon validator errors on it).

## `defineModule` fields

`name` (explicit — no derivation games), `displayName`, `emoji`,
`description`, `short`, `endUserDataStatement` (or the `NoEndUserData()`
sentinel), `version` (defaults to the repo version), `category`,
`disableable` (default true), `dependencies`/`conflicts` (default `[]`),
`configSchema` (a `cfg.object(...)`, never hand-written `configFields` —
`fieldsFromSchema` derives them), `configOverrides` (default true). Lifecycle
and GDPR hooks below are plain fields on the same object.

`defineModule` wraps the object with defaulted `onLoad`/`onUnload` that
forward to your hooks (`module.ts:88-103`).

## Lifecycle hooks

All hooks take `(services, ...)` — no `this.container`:

- `onLoad(services)` — register task-fire handlers, config-change hooks, manual
  listeners here. Fire-and-forget reconciliation applies: slow work must not
  block load.
- `onUnload(services)` — tear down everything `onLoad` registered. Nothing
  does this automatically.
- `deleteUserData(services, userId)` / `exportUserData(services, userId)` —
  GDPR hooks called by `@lumi/lib/gdpr/requests.js`. Return `null` from export when there is
  nothing. Redact third-party IDs rather than exporting them verbatim
  (`ModModule.exportUserData` pattern, GDPR Recital 63).

## Sub-store directories and discovery

`KnownSubstores` (`packages/contracts/src/manifest.ts:8-16`): `commands`,
`listeners`, `interactions`, `preconditions`, `utilities`,
`scheduled-tasks`, `routes`. `ModuleStore` scans each registered root for
module dirs (manifest first, then `index.ts`), loads every `.ts`/`.js`/`.mts`
under each present sub-store (skipping `_`-prefixed files), then the module's
own `index.ts`. A `tasks/` directory is silently never scanned.

Dependencies and conflicts are enforced by topo-sort (`#topoSort`): missing /
circular / disabled dependencies cascade-disable dependents with a
`failureReason`, never a crash. Conflicts disable the other module with a
warning; first-registered wins.

## Config schema system

`cfg.*` builders (`config-schema.ts`) wrap validators and tag UI metadata in a
`WeakMap`, so `fieldsFromSchema` recovers the dashboard/panel `ConfigField[]`
with no parallel list. Builders: `boolean`, `number` (+`step` slider),
`string`, `enum`, `channel`/`role`/`user` (+`channelTypes`), `duration`
(+`quickPicks`), `multiChannel`/`multiRole`/`multiUser`, `stringList`. `group`
clusters fields into dashboard subsections — omit it for small modules.
`validateModuleConfigValue` is the single validation point for dashboard and
command writes; undeclared keys pass through unchecked.

## Gotchas

- **Piece renaming on construct.** Every module entry is `index.ts`, so
  `ModuleStore.construct` renames each piece to its record name before insert
  — otherwise each load would evict the previous module.
- **`onLoad` reconciliation is fire-and-forget** — anything depending on
  re-armed jobs at boot needs its own wait.
- **Scheduled tasks are one-line handlers**: a piece under `scheduled-tasks/`
  republishes onto the scheduler bus for a `registerTaskFireHandler` to
  execute — see `modules/mod/scheduled-tasks/modLift.ts`.
- **Disabled ≠ broken but both block dependents** — intentional, so dependents
  report "unavailable" consistently.
- **`services/` and `data/` are conventions, not stores** — plain code imported
  directly (`economy`'s `BankService` is constructed ad hoc, never
  auto-discovered).
