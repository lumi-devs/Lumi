# Adding a module

Worked example: `afk` (`packages/core/src/modules/afk/`) — config schema, a
command, listeners, scheduled tasks, KV data, and both GDPR hooks. Background:
`agents/architecture/module-system.md`.

## 1. Scaffold the directory

```
packages/core/src/modules/<name>/
  index.ts                     # export const <name>Module = defineModule({...})
  manifest.json                # generated/kept in sync, see step 5
  constants.ts                 # Valkey key builders + TTLs
  config.ts                    # typed config readers (optional)
  data/<name>.ts               # Valkey/Prisma read-write functions
  commands/<name>.ts
  listeners/<event>.ts         # optional
  interactions/...             # optional buttons/selects/modals
  scheduled-tasks/<x>.ts       # optional
```

Only `commands`, `listeners`, `interactions`, `preconditions`, `utilities`,
`scheduled-tasks`, `routes` are auto-discovered (`KnownSubstores`,
`packages/contracts/src/manifest.ts:8-16`). Anything else (`services/`,
`lib/`, `data/`, `constants.ts`) is plain code you import yourself. Never a
`tasks/` directory — only `scheduled-tasks/` is scanned.

## 2. Write `index.ts` with `defineModule`

```ts
export const afkModule = defineModule({
  name: "afk",
  displayName: "AFK",
  emoji: "💤",
  description: "...",
  short: "...",
  endUserDataStatement: "...",
  category: "Community",
  configSchema: cfg.object({ ... }),
  onLoad(services) { registerTaskFireHandler(...); },
  onUnload(services) { /* tear down what onLoad registered */ },
  async deleteUserData(services, userId) { /* ... */ },
  async exportUserData(services, userId) { /* ... */ },
});
```

Set `name` explicitly. `endUserDataStatement` is required for the GDPR UI (or
the `NoEndUserData()` sentinel). Don't hand-write `configFields` —
`fieldsFromSchema` derives them. Hooks take `(services, ...)` and tear-down in
`onUnload` what `onLoad` registered — nothing does it automatically.

## 3. Config schema, if the module has per-guild settings

`cfg.*` builders (`config-schema.ts`): `boolean`, `number` (+`step`),
`string`, `enum`, `channel`/`role`/`user` (+`channelTypes`), `duration`
(+`quickPicks`), `multiChannel`/`multiRole`/`multiUser`, `stringList`. Group
with `group:` only if the module has enough settings to need dashboard
subsections. Read at runtime via
`container.db.config.getModuleConfig(guildId, "<module>", "<key>")` (see
`afk/config.ts:3-7`).

## 4. At least one command

See `adding-a-command.md`. Set `module: "<name>"` on the def so the command
respects the per-guild toggle. Shared stateful logic goes in a utility
accessed via `getUtility("<name>")` (see `AfkUtility.ts`, including the
`declare module` augmentation) rather than instantiated inline.

## 5. Permit nodes, only with gating to do

Most small modules gate nothing. Otherwise set `requiredPermit` on the command
(see `agents/domains/permissions.md`) — the vocabulary is read live off
command defs, single-sourced in `packages/contracts/src/permit-nodes.ts`.

## 6. `manifest.json`

Mirrors the `defineModule` fields plus detected `subStores` and derived
`configFields`. Regenerate with `bun run modules:manifest`
(`packages/core/scripts/generate-manifests.ts`) and check the diff; current
version is `"0.6.0"`.

## 7. i18n keys

Add strings to `packages/core/src/languages/en-US/<namespace>.json` (only
locale in the repo). Register new namespaces in `LumiNamespaces`
(`packages/core/src/lib/i18n/index.ts:25-35`). See `i18n.md`.

## 8. Tests

`packages/core/tests/modules/<name>/`, `describe`/`it` from `bun:test`,
`container` stubbed directly. Cover key builders, data-layer functions, and
one `it` per behavior. Mock-Prisma driver at `tests/mocks/prisma.ts` for
repository-touching code.

## Order that works end to end

1. `index.ts` + `manifest.json` — get it loading first.
2. `constants.ts` + `data/` — storage, testable in isolation.
3. One command on that data layer.
4. i18n keys, tests, then extras (permits, listeners, tasks).
