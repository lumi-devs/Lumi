# Addon Publishing Guide

Addons are third-party (or first-party-but-optional) modules distributed outside this repo and installed at runtime through Lumi's built-in downloader - no restart, no rebuild. This guide covers writing one and getting it into [`lumi-addons`](https://github.com/lumi-devs/lumi-addons), the first-party addon repository.

If you're adding a module that ships *with* the bot itself, you want the [Module Creation Guide](GUIDE_MODULE_CREATION.md) instead - this page is specifically about the addon distribution path.

## How installation works

```sh
# Register an addon repository (once)
,repo add lumi-addons https://github.com/lumi-devs/lumi-addons.git

# Install a specific addon from it
,download install lumi-addons <addon-name>

# Install a specific revision (commit/branch/tag) instead of latest
,download install lumi-addons <addon-name> <revision>

# Roll back an installed addon to a prior revision
,download rollback <addon-name> <revision>

# Enable it for a guild
/modules enable <addon-name>
```

The downloader clones the repo, treats each top-level directory as an addon, and registers it as a Sapphire base path - your `commands/`, `listeners/`, etc. sub-store folders are discovered automatically. You never call `stores.registerPath` yourself.

`,repo add` shows a one-time confirmation prompt before cloning, warning that code from the repo runs **inside the bot process** with full access to its database, cache, and Discord client, and that Lumi doesn't review or vet third-party repositories. Declining, or not responding within 30 seconds, cancels the add - nothing gets cloned. This is a bot-owner-facing warning about the repo as a whole, not something your addon needs to do anything about.

### Installation revisions

The `install` command optionally accepts a third parameter - a git revision (commit hash, branch name, or tag) to install at instead of the repo's default branch. Similarly, `rollback` checks out an already-installed addon to any prior revision, useful if a newer version has a breaking bug. Both commands require a bot restart to fully apply the change. This also works via the dashboard's `/system/addons` page - installed addons show a "Rollback" button, and uninstalled addons have an "Advanced" mode that lets you specify a revision before installing.

## Anatomy of an addon

Only `info.json` and `index.ts` are mandatory:

```
my-addon/
├── info.json              # Downloader metadata - required
├── index.ts                # Module entrypoint (@DefineModule) - required
├── README.md                 # User-facing usage guide
├── commands/                  # BaseCommand / BaseSubcommand pieces
├── listeners/                  # Sapphire Listener pieces
├── interaction-handlers/        # buttons / selects / modals
├── scheduled-tasks/              # BullMQ ScheduledTask pieces - exact folder name
└── lib/                            # plain helpers, not pieces
```

`info.json` (downloader metadata - distinct from a built-in module's generated `manifest.json`):

```json
{
  "name": "my-addon",
  "author": ["YourName"],
  "description": "What your addon does, one or two sentences.",
  "short": "One-line tagline.",
  "version": "1.0.0",
  "requirements": []
}
```

`index.ts` follows the same `@DefineModule` pattern as a built-in module (see the [Module Creation Guide](GUIDE_MODULE_CREATION.md#step-1-define-module-metadata)):

```typescript
import { Module, DefineModule, cfg } from "lumi";

@DefineModule({
  name: "my-addon",
  displayName: "My Addon",
  emoji: "🚀",
  version: "1.0.0",
  description: "What your addon does.",
  configSchema: cfg.object({
    log_channel_id: cfg.channel({
      label: "Log Channel",
      description: "Where events are posted.",
    }),
  }),
})
export class MyAddonModule extends Module {
  public override async deleteUserData(userId: string, requester) {
    // Delete anything keyed by userId here, or justify a no-op.
  }

  public override async exportUserData(userId: string) {
    // Return anything keyed by userId here, or null if you store nothing.
    return null;
  }
}
```

Config declared in `configSchema` is automatically editable via `/config` and the dashboard - read it back with `container.db.config.getModuleConfig(guildId, "my-addon", "log_channel_id")`.

## Addon-specific rules

These are stricter than the built-in module rules because addons run untrusted, outside this repo, and can't ship schema migrations:

- **Import through the SDK, never Lumi's internal paths.** Addon code must import from `"lumi"` and its subpaths - `"lumi"` (`Module`, `DefineModule`, `cfg`, `Service`/`getService`), `"lumi/commands"` (`BaseCommand`, `BaseSubcommand`, `CommandContext`), `"lumi/permissions"`, `"lumi/scheduling"`, `"lumi/ui"` (cards, `Emojis`, pagination, `confirmPrompt`), `"lumi/utils"` - never `#core/*`, `#lib/*`, `#utilities/*`, or `#database/*`. Those are implementation details that move on any core refactor; the addon linter emits a warning if it sees one of them imported directly (see `validateAddon` in the downloader).
- **Dependency isolation**: list external packages in `info.json`'s `requirements` array. The downloader creates a private `package.json` inside the addon directory and runs `bun add` there - never assume anything about the bot's root `package.json`.
- **No `DatabaseService` methods.** Addons must be 100% self-contained; you cannot add a repository to the shared `container.db` facade.
- **No `container.prisma`, ever.** Addons get no schema of their own.
- **Persist through `container.db.guildKV`** - the generic key/value store, keyed `guildId + module + targetId + key`. Note `listModuleData({ module, key, guildId })` filters on `key`, so the identifier that *varies per record* goes in `targetId`, and `key` names the collection (see `activity-roles/lib/store.ts` in `lumi-addons` for the pattern). For read-modify-write on one row (e.g. appending to a stored list), use `container.db.guildKV.mutateModuleData(guildId, module, targetId, key, (current) => next)` instead of a manual `getModuleData` + `setModuleData` pair - it holds a Redis lock across the read and write so two concurrent writers can't clobber each other. Returning `undefined` from the mutator deletes the row.
- **Use `container.redis` for ephemeral state**, with key builders defined in a local `keys.ts` - same convention as built-in modules.
- **GDPR**: if your addon stores anything keyed by a user ID (Postgres via `guildKV`, or Redis), override both `deleteUserData(userId, requester)` and `exportUserData(userId)` and act on it there. If you store nothing, write `// No-op` overrides with a one-line justification rather than omitting the methods.
- **UI through the card system**: never `new EmbedBuilder()`. Use `makeSuccessCard`, `makeErrorCard`, `makeWarningCard`, `makeInfoCard` from `"lumi/ui"`, or the `reply*` helpers on `CommandContext`.
- **BullMQ pieces live in a folder named exactly `scheduled-tasks/`** - a `tasks/` directory is silently ignored, not an error. Discord/DB side effects of a fire must go through `registerTaskFireHandler(name, mode, handler)` in `onLoad`, same as built-in modules (see [Scheduled Tasks](GUIDE_MODULE_CREATION.md#step-7-scheduled-tasks)).
- **No imports from sibling addons.** Same zero-cross-module-import rule as built-in modules, just enforced across addon directories instead of `packages/core/src/modules/`.

## Pre-submission checklist

Link a local Lumi checkout first - the type-check/lint gates run against it:

```sh
git clone https://github.com/lumi-devs/lumi ../lumi
cd lumi-addons
bun run setup   # or LUMI_PATH=/path/to/lumi bun run setup
```

Before opening a PR:

1. `bun run typecheck` - zero compile errors.
2. `bun run lint` - zero lint errors.
3. Your addon has a `README.md` describing what it does and how to configure it.
4. Every user-facing string is added to `en-US` at minimum (see [Translations](GUIDE_MODULE_CREATION.md#step-9-translations)).
5. `deleteUserData` and `exportUserData` are implemented or explicitly no-op'd with a comment explaining why.
6. No addon-to-addon imports, no `container.prisma`, no raw `EmbedBuilder`.

Both gates are enforced in CI (`lumi-addons`' `ci.yml`) - a red check blocks merge regardless of review status.

## GitHub workflow

1. Fork [`lumi-addons`](https://github.com/lumi-devs/lumi-addons).
2. Create a feature branch: `git checkout -b addon/my-addon`.
3. Add your addon directory at the repo root (not nested).
4. Commit with a clear, scoped message (e.g. `feat(my-addon): initial implementation`).
5. Push and open a PR against `main`. Describe what the addon does, how to configure it, and any external dependencies it pulls in via `requirements`.
6. CI runs `typecheck` and `lint` automatically against the PR.

## Code review

Reviewers will generally check for the addon-specific rules above first - `container.prisma` usage, missing `deleteUserData`/`exportUserData`, raw `EmbedBuilder` calls, and cross-addon imports are the most common rejection reasons. Beyond that, expect the same review bar as the main [Lumi contributing guide](../CONTRIBUTING.md): clear naming, no dead code, and commands/config that match what the README documents.

Address feedback with follow-up commits on the same branch rather than force-pushing over review history, unless a reviewer asks you to squash before merge.

## Versioning & updates

Bump `version` in `info.json` on any behavioral change - this is what `,repo update` / the dashboard's addon-update check compares against to know a new version is available. There's no separate changelog file requirement for addons (unlike core `Lumi`, which uses Changesets); a clear PR description and commit messages are sufficient.

A bot owner can freeze an installed addon at its current version with `,module pin <name>` (mirroring Red's `[p]cog pin`) - `,module update <name>` and a bare `,module update` (all installed modules) both skip a pinned module instead of checking it for updates. `,module unpin <name>` removes the lock. This is entirely owner-side; your addon doesn't need to do anything to support it, but it's worth a line in your README if users might want to pin before a breaking version bump.
