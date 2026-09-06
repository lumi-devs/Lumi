# Addon SDK

Third-party addons are downloaded git repos symlinked into the module tree. Their only
supported import surface is the `lumi` package (self-referencing the repo root's own
`package.json`), never `#core`/`#lib`/`#utilities`/`#database`. This is enforced two ways:
static analysis at install time (`validate.ts`) and, for first-party core modules, an ESLint
rule — addons themselves aren't linted by this repo's ESLint config since they live outside
`packages/*/src`.

## The `exports` map (root `package.json:14-21`)

```json
"exports": {
  ".": "./packages/core/src/lib/addon-sdk/index.ts",
  "./commands": "./packages/core/src/lib/addon-sdk/commands.ts",
  "./permissions": "./packages/core/src/lib/addon-sdk/permissions.ts",
  "./scheduling": "./packages/core/src/lib/addon-sdk/scheduling.ts",
  "./ui": "./packages/core/src/lib/addon-sdk/ui.ts",
  "./utils": "./packages/core/src/lib/addon-sdk/utils.ts"
}
```

The root `package.json`'s own comments (`comment:imports`/`comment:exports`, lines 12-13)
explain the mechanism precisely: an installed addon is symlinked into
`packages/core/src/modules/` but its *realpath* lives under `data/3rd-party-modules/`
(or, once installed, `data/installed-modules/<name>` — see below). Node/Bun resolve `#`
subpath imports and bare `"lumi"` self-references from a file's realpath's nearest
`package.json`, which for an addon is this root one, not `packages/core/package.json`. That's
why an addon's `#lib/*.js` specifier would (if allowed) resolve through *this* root's
`imports` map (`package.json:22-37`) rather than the core package's — and why `import ...
from "lumi"` just works with zero addon-side configuration.

## Full exported surface (verified from the six SDK files)

`lumi` (`addon-sdk/index.ts`):
`Module`, `DefineModule`, `NoEndUserData`, `noEndUserData`, `cfg`, `FieldType`,
`toStringArray`, `ModuleMeta`, `ModuleOptions`, `ConfigField`, `ModuleConfigSchema`,
`ModuleListener`, `ModuleListenerOptions`, `GuildMessageListener`, `Utility`, `getUtility`,
`tryGetUtility`, `Utilities`.

`lumi/commands` (`addon-sdk/commands.ts`):
`BaseCommand`, `BaseSubcommand`, `CommandContext`, `BucketScope`, `sendReply`,
`replySuccess`, `replyError`, `replyWarning`, `replyInfo`, `assertPermit`, `ReplyOptions`,
`CommandReplyTarget`.

`lumi/permissions` (`addon-sdk/permissions.ts`):
`hasRequiredPermit`, `checkModulesEnabled`, `isModuleEnabled`.

`lumi/scheduling` (`addon-sdk/scheduling.ts`):
`RelayTask`, `shouldRunNow`, `DefaultCatchupGraceMs`, `CatchUpMeta`, `scheduleTask`,
`cancelTask`, `publishTaskFire`, `registerTaskFireHandler`.

`lumi/ui` (`addon-sdk/ui.ts`):
card builders `makeCard`, `makeInfoCard`, `makeSuccessCard`, `makeWarningCard`,
`makeErrorCard`, `makeListCard`, `makeEmptyCard`, `ephemeralCard`, `noPingCard`,
`resolveCardColor`, `defaultCardColors`, `CardReply`, `CardOptions`, `CardColorKey`; panel
kit `confirmRow`, `backRow`, `navRow`, `pageFooter`, `tabRow`, `settingRow`, `thumbRow`,
`HubTabs`, `SectionLineLimit`, `ButtonLabelLimit`, `AccessoryButton`, `Tab`,
`ConfirmRowOptions`, `NavAction`, `NavRowOptions`; plus `confirmPrompt`, `paginateList`,
`paginateContainer`, `Emojis`, and addon-specific re-export wrappers `addonSettingRow`,
`addonTabRow`, `addonConfirmRow`, `addonBackRow`, `addonNavRow`, `addonPageFooter` — these
last six are literally one-line pass-throughs to the same core functions (see
`ui.ts:64-103`), kept as a separate naming convention rather than a different implementation.

`lumi/utils` (`addon-sdk/utils.ts`):
`BotConfig`, `relativeTimestamp`, `shortTimestamp`, `parseDuration`, `formatDuration`,
`errorFrom`, `swallow`, `logError`, `acquireRedisLock`, `verifyRedisLock`, `RedisLock`,
`RedisLockOptions`, `GuildMessage`.

Notably absent from every subpath: `container.db`/`container.prisma`, `container.redis`
directly, `container.invalidation`. Addons get no Prisma schema of their own — persistence is
`container.db.guildKV` or `container.redis` per the validator's own error message
(`validate.ts:330-333`).

## Symlink mechanism (`downloader/resolver.ts`)

Two on-disk roots, both under `data/`:

- `ModuleRoot = data/3rd-party-modules/<repoName>` — a real git clone/pull target
  (`resolver.ts:70-74`, `addRepo`).
- `AddonModulesRoot = data/installed-modules/<moduleName>` — a symlink into a subdirectory of
  a cloned repo (`resolver.ts:76-80`, `installModule:262-375`). `installModule` validates
  the addon (`validateAddon`, described below) *before* creating the symlink
  (`resolver.ts:289-294`) and refuses to overwrite a same-named module symlinked from a
  different repo (`resolver.ts:356-365`).

`ModuleStore` is told about both roots by `installContainerServices`
(`packages/core/src/lib/client/container-services.ts:37-42`):

```ts
moduleStore.addRoot(new URL("../../modules/", import.meta.url)); // core modules
moduleStore.addRoot(pathToFileURL(`${AddonModulesRoot}/`));       // installed addons
```

`ModuleStore.isAddonModule` (`ModuleStore.ts:85-91`) distinguishes "addon" from "core" purely
by whether a module's directory sits inside the *first* registered root — order matters, the
core root must be registered first.

If an addon's `info.json` declares `requirements` (npm packages), `installModule`
(`resolver.ts:319-352`) writes a throwaway local `package.json` inside the addon's *source*
directory (not the symlink target) and runs `bun add --ignore-scripts` scoped to that
directory, then symlinks `node_modules/lumi` back to the repo root so the addon's own
isolated `node_modules` can still resolve `import ... from "lumi"`.

## `validate.ts` — what actually gets flagged

Read in full; every check below is real, not inferred:

**Errors (block install):**
- Missing `info.json` (`validate.ts:262-264`); malformed JSON; schema violations against
  `infoSchema` (`validate.ts:13-27`) — `name` must match `^[a-z0-9][a-z0-9-]*$`, `author`
  must be a non-empty string array, `version` must look like semver, and
  `end_user_data_statement` is **required** (a dedicated error message calls this out by
  name, `validate.ts:228-231`, distinct from the generic schema-violation message).
- `info.json`'s `name` must equal the addon's directory name (`validate.ts:241-245`).
- `min_bot_version`/`max_bot_version` checked against the running `LumiInfo.version` via real
  semver comparison (`isVersionCompatible`/`isMaxVersionCompatible`, handles `v`-prefixes,
  pre-release tags, build metadata) — an addon requiring a newer Lumi than what's running, or
  capped below it, fails validation (`validate.ts:246-255`).
- If present, `manifest.json` is schema-checked (`manifestSchema`, `validate.ts:49-62`) and
  its `name` must also match the directory name.
- Missing `index.ts` (`validate.ts:310-312`); `index.ts` not using `@DefineModule(` (regex
  check, `validate.ts:300-301`); `index.ts` with no `export` at all
  (`validate.ts:302-305`).
- A `tasks/` directory present anywhere in the addon (`validate.ts:314-318`) — see the
  module-system doc's gotcha about `scheduled-tasks/` being the only scanned name.
- Any `.ts` file (recursively, skipping `node_modules`/`.git`/`dist`/`build`) that: imports
  `EmbedBuilder` from `discord.js` or `@discordjs/builders`, or constructs `new
  EmbedBuilder()` directly (`validate.ts:326-329`); touches `container.prisma`
  (`validate.ts:330-333`); imports `#modules/...` (cross-module import,
  `validate.ts:345-349`); imports any `#core/`, `#lib/`, `#utilities/`, `#database/`, or
  `#root/` path directly (`validate.ts:351-355` — this is the actual enforcement point for
  "addons only use `lumi`"); or has a relative import that resolves outside the addon's own
  root directory (`validate.ts:356-365`).

**Warnings (non-blocking, still surfaced to whoever runs the validator):**
- `index.ts` hand-authoring `configFields:` instead of a `configSchema` with `cfg.*`
  (`validate.ts:306-309`).
- Calling `stores.registerPath(...)` — redundant, the Downloader already registers the addon's
  path (`validate.ts:334-337`).
- A batch of best-effort memory-leak heuristics (`checkLeakHeuristics`, `validate.ts:99-180`),
  explicitly documented as regex-level guesses that can't prove an actual leak: an untracked
  `setInterval`/`setTimeout` return value, a timer variable with no matching
  `clearInterval`/`clearTimeout` anywhere in the same file, a `.on(`/`.addListener(` call with
  no `onUnload`/`dispose`/`.off(`/`removeListener`/`removeAllListeners` in the same file, a
  module-scope `let`, or a module-scope `[]`/`Map`/`Set` that's pushed/set/added to but never
  trimmed or bounds-checked. All of these can have a false positive (cleanup living in an
  imported helper or base class) — treat them as prompts to check, not proof of a bug.

`validateAddonOrRepo` (`validate.ts:373-395`) is the entry point used by `bun run validate`
(root `package.json` script, `scripts/validate-addon.ts`) — it accepts either a single addon
directory (has its own `info.json`) or a directory of many addons.

## Addon manifest format

Two files, distinct purposes, both validated if present:

- `info.json` — required, author-supplied Downloader metadata (name, author, description,
  version, `end_user_data_statement`, optional `requirements`/`tags`/`min_bot_version`/
  `max_bot_version`/`hidden`). Real example, `examples/hello-world/info.json`:

  ```json
  {
    "name": "hello-world",
    "author": ["Lumi Developers"],
    "description": "The simplest possible Lumi addon: one command, one config field, one listener.",
    "short": "A minimal starter addon.",
    "version": "1.0.0",
    "requirements": [],
    "end_user_data_statement": "This addon does not collect or store any personal end-user data."
  }
  ```

- `manifest.json` — generated, not hand-written. `installModule` synthesizes one from
  `info.json` if absent at install time (`resolver.ts:296-315`) with `configFields: []` and
  `subStores` from `detectSubStores`. Once a module (core or addon) actually runs, `bun run
  modules:manifest` (`scripts/generate-manifests.ts`) regenerates it from the class's live
  `@DefineModule` meta, which is why a *core* module's checked-in `manifest.json` (e.g.
  `modules/mod/manifest.json`) has real `configFields` derived from its `configSchema`, while
  a freshly-installed addon's synthesized one starts with an empty `configFields` array until
  it's regenerated.

No example addon in this repo ships a hand-written `manifest.json` — all three
`examples/*` addons (`hello-world`, `tag-manager`, `giveaway`) rely on `info.json` only and
let the manifest get generated.
