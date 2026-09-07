# Adding a module

Worked example: `afk` (`packages/core/src/modules/afk/`) — one of the smallest real
modules in the repo, but it exercises every piece a new module needs: config schema,
a command, a listener, an interaction handler, a scheduled task, Redis-backed data, and
both GDPR hooks. Background on the mechanics referenced below: `agents/architecture/module-system.md`.

## 1. Scaffold the directory

```
packages/core/src/modules/<name>/
  index.ts                     # the @DefineModule class itself
  manifest.json                # generated/kept in sync, see step 6
  keys.ts                      # Redis key builders + TTLs, if the module touches Redis
  data/<name>.ts                # Redis/Prisma read-write functions, imported by commands/utilities
  commands/<name>.ts
  listeners/<event>.ts          # optional
  interaction-handlers/<x>.ts   # optional, only if the module has buttons/selects/modals
  scheduled-tasks/<x>.ts        # optional
  utilities/<Name>Utility.ts    # optional, only if commands/handlers need shared stateful logic
```

Only `commands`, `listeners`, `interaction-handlers`, `preconditions`, `utilities`,
`scheduled-tasks`, `routes` are auto-discovered sub-stores (`KnownSubstores`,
`packages/contracts/src/manifest.ts:10-18`). A `services/` directory (used by `economy`)
or a `lib/` directory (used by `afk`, `mod`) is plain application code you import
yourself — it is never auto-loaded. Don't create a `tasks/` directory expecting it to
behave like `scheduled-tasks/` — the addon validator flags that exact mistake as an error.

## 2. Write `index.ts` with `@DefineModule`

`afk/index.ts:44-91`:

```ts
import { Module, DefineModule, cfg } from "#lib/module-system/Module.js";
import { container } from "@sapphire/framework";
import { Emojis } from "#lib/utilities/assets.js";
import { registerTaskFireHandler } from "#lib/task-fire-registry.js";
import { clearAllAfkForUser } from "./data/afk.js";

@DefineModule({
  name: "afk",
  displayName: "AFK",
  emoji: Emojis.Afk,
  description:
    "Set yourself AFK; mentions notify others and a prefix is added to your nickname.",
  short: "Set yourself AFK with automated status and mention alerts.",
  endUserDataStatement:
    "Stores user ID, optional AFK reason message, and timestamps to notify others when mentioned. Cleared automatically upon return or on GDPR erasure.",
  category: "Community",
  configSchema: cfg.object({
    nick_prefix_enabled: cfg.boolean({
      label: "Nickname Prefix",
      description: "Prepend [AFK] to nickname while AFK.",
      default: true,
    }),
  }),
})
export class AfkModule extends Module {
  public override onLoad() {
    registerTaskFireHandler("afk-delete-message", "unicast", handleAfkDeleteMessageFire);
    return super.onLoad();
  }

  public override onUnload() {
    this.container.logger.info("[AfkModule] Unloaded AFK module task handlers.");
    return super.onUnload();
  }

  public override async deleteUserData(userId: string): Promise<void> {
    await clearAllAfkForUser(userId);
  }

  public override async exportUserData(userId: string) {
    const entries = await container.db.afk.findAllForUser(userId);
    return entries.length > 0 ? { afkEntries: entries } : null;
  }
}
```

Fields that matter and what happens if you omit them (`Module.ts:88-104`):

- `name` — if omitted, derived from the class name (`AfkModule` → `afk`). Set it
  explicitly anyway; every real module does.
- `category` — used by the dashboard's module list grouping (`afk` uses
  `"Community"`; check existing categories before inventing a new one —
  `apps/dashboard/src/lib/config-labels.ts` or the dashboard modules page is
  where they render).
- `endUserDataStatement` — required for the GDPR export UI to show something
  meaningful. If the module genuinely stores nothing about end users, use the
  `NoEndUserData()` sentinel instead of leaving this undefined or writing a
  placeholder string.
- `configSchema` — build with `cfg.*` (see step 3). Don't hand-write
  `configFields` — the addon validator warns on it, and `fieldsFromSchema`
  derives the array for you.
- `disableable`, `dependencies`, `conflicts`, `configOverrides` — leave at their
  defaults (`true`, `[]`, `[]`, `true`) unless you have a concrete reason; `afk`
  doesn't set any of them.

If your module registers anything in `onLoad` (a config-change hook, a task-fire
handler, a listener you attach manually rather than via the `listeners/` store),
tear it down in `onUnload` — nothing does this automatically. `afk` only needs to
log on unload since `registerTaskFireHandler` doesn't need explicit teardown here,
but `mod/index.ts:52-55` shows the pattern for a module that does register a
config-change hook.

## 3. Config schema, if the module has per-guild settings

`cfg.*` builders live in `packages/core/src/lib/module-system/config-schema.ts:39-156`.
Pick the builder that matches the dashboard widget you want:

| Setting shape | Builder |
| --- | --- |
| on/off toggle | `cfg.boolean({ label, description, default })` |
| number, optionally with a slider | `cfg.number({ label, description, default, step? })` |
| free text | `cfg.string({ label, description, default })` |
| fixed choice list | `cfg.enum({ label, description, choices, default })` |
| a channel/role/user picker | `cfg.channel` / `cfg.role` / `cfg.user` (accepts `channelTypes` on `cfg.channel`) |
| duration like `"5m"`/`"2h"` | `cfg.duration({ ..., quickPicks? })` |
| multi-select of the above | `cfg.multiChannel` / `cfg.multiRole` / `cfg.multiUser` |
| list of free-text strings | `cfg.stringList` |

Group related fields with `group: "Some Section"` if the module has enough
settings to need dashboard subsections (`logging`, `welcome` do this) — the
config-schema doc comment explicitly says to omit `group` for a small module
like `afk` rather than force one.

Read the value at runtime via `container.db.config.getModuleConfig(guildId, "<module>", "<key>")`
— see `afk/index.ts:33-42`'s `isAfkNickPrefixEnabled`.

## 4. At least one command

`afk/commands/afk.ts` is a full worked example — see
`agents/workflows/adding-a-command.md` for the step-by-step on writing the
command file itself once the module exists. Two things specific to a
brand-new module's first command:

- Set `module: "afk"` in `@ApplyOptions<BaseCommand.Options>` (`afk.ts:38`) —
  paired with the `ModuleEnabled` precondition (`afk.ts:37`), this is what makes
  the command actually respect the per-guild module on/off toggle. A command
  with no `module` field runs even if nothing ever "enables" it.
- If the command needs shared logic beyond simple Redis/Prisma calls (state,
  multi-step orchestration), put it in a `utilities/<Name>Utility.ts` class
  extending `Utility` (`#lib/module-system/Utility.js`) and access it via
  `getUtility("afk")` (`afk.ts:54-56`, `AfkUtility.ts:23-24`) rather than
  instantiating it inline — this is how `setAfk`/`cleanStaleEntries` are shared
  between the command and the module's own sweep logic. Register the type with
  the `declare module` augmentation at the bottom of the utility file
  (`AfkUtility.ts:101-105`) so `getUtility`'s generic resolves correctly.

## 5. Permit nodes, only if the module needs permission gating

Most small modules (`afk`) don't gate anything — anyone can run `/afk`. If your
module has a moderation-adjacent or destructive action, add a node: see
`agents/domains/permissions.md` for the two-file (`packages/core/src/lib/permissions/permit-nodes.ts`
+ `apps/dashboard/src/lib/permit-nodes.ts`) sync step, then set
`requiredPermit: "<yourModule>.<action>"` on the command.

## 6. `manifest.json`

`afk/manifest.json` mirrors the decorator's fields plus `subStores` (whichever
of the known sub-store directories physically exist) and the derived
`configFields` array:

```json
{
  "name": "afk",
  "displayName": "AFK",
  "emoji": "💤",
  "description": "Set yourself AFK; mentions notify others and a prefix is added to your nickname.",
  "short": "Set yourself AFK with automated status and mention alerts.",
  "endUserDataStatement": "Stores user ID, optional AFK reason message, and timestamps to notify others when mentioned. Cleared automatically upon return or on GDPR erasure.",
  "version": "0.3.0",
  "disableable": true,
  "dependencies": [],
  "conflicts": [],
  "configOverrides": true,
  "targetUtility": "worker",
  "subStores": ["commands", "listeners", "interaction-handlers", "utilities", "scheduled-tasks"],
  "configFields": [
    {
      "key": "nick_prefix_enabled",
      "type": "BOOLEAN",
      "label": "Nickname Prefix",
      "description": "Prepend [AFK] to nickname while AFK.",
      "default": true
    }
  ],
  "category": "Community"
}
```

Keep `configFields` in sync with the `configSchema` by running
`bun run modules:manifest` (`scripts/generate-manifests.ts` regenerates manifests from the
live `@DefineModule` meta) and verifying the diff — verify against the schema table in
step 3 for the correct `type` string
(`BOOLEAN`, `NUMBER`, `STRING`, `ENUM`, `CHANNEL`, `ROLE`, `USER`, `DURATION`,
`MULTI_ROLE`, `MULTI_CHANNEL`, `MULTI_USER`, `STRING_LIST`).

## 7. i18n keys

See `agents/conventions/i18n.md` for the full four-file workflow. Concretely for a
new module: create `packages/core/src/lib/i18n/keys/commands/<name>.ts` (one file per
module, e.g. `afk.ts`), export a `<Name>CommandsKeys` const object, and spread it into
the aggregate in `keys/commands.ts`. Add the actual strings to
`packages/core/src/languages/en-US/commands.json` (and every other locale's
`commands.json`, byte-identical English text — see the i18n doc for why) using
the naming convention `<key>Name`/`<key>Description` for slash command/option
metadata (consumed via `applyLocalizedBuilder`) and `<key>Title`/`<key>` pairs for
runtime reply text.

If the module has its own runtime strings beyond `commands.json` (afk has an
`afk.json` namespace for `defaultReason`, `jumpToMessage`, etc. — check
`packages/core/src/languages/en-US/afk.json`), register the new namespace name
in `LumiNamespaces` (`packages/core/src/lib/i18n/index.ts:15-25`) and make sure
every locale directory gets the new namespace file, not just `en-US`.

## 8. Tests

Per `agents/conventions/testing.md`: tests for a new module go in
`packages/core/tests/modules/<name>/`, mirroring the module's own internal
structure loosely (one file per concern, not one-per-source-file). `afk`'s
tests live in `packages/core/tests/modules/afk/afk.test.ts` and cover:

- Key-builder correctness (`AfkKeys.afk("g1","u1") === "lumi:afk:g1:u1"` etc.) —
  cheap, high-value, catches a typo'd Redis key format immediately.
- The data-layer functions (`setAfkEntry`, `getAfkEntry`, `clearAllAfkForUser`, ...)
  with `@sapphire/framework`'s `container` mocked wholesale (`redis`, `db`,
  `logger`, `invalidation` all as `vi.fn()` stubs) — no real Redis/Postgres
  connection, per the repo's mocking convention.
- `vi.clearAllMocks()` in a `beforeEach`, `describe`/`it` imported explicitly
  from `"vitest"` (no globals).

Write one `it` per actual behavior with a full-sentence description
(`'should generate correct key strings and TTL values'`, not `'works'`). If the
module touches `container.prisma`/`container.db` through a repository class
rather than plain redis calls, use the in-memory mock Prisma driver at
`packages/core/tests/mocks/prisma.ts` instead of hand-rolling stub objects.

## Order that actually works end to end

1. `index.ts` + `manifest.json` first — get the module loading (even with zero
   commands) and showing up in `/module list` / the dashboard's module page.
2. `keys.ts` + `data/<name>.ts` — the storage layer, testable in isolation.
3. One command wired to that data layer.
4. i18n keys for that command.
5. Tests for the data layer and the command's core logic.
6. Only then: permit nodes, additional commands, listeners, scheduled tasks.

Trying to write the command and the data layer simultaneously without a
working `index.ts` means you can't actually load the module in a dev bot to
sanity-check anything until the very end — get step 1 loading first.
