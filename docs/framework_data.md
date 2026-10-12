# Framework: Data

## KV store

Per-guild namespaced key/value rows (`module_dynamic_data`) for small
module state that isn't config:

```ts
await api.kv.get(userId, "nickname");
await api.kv.set(userId, "nickname", "Bob");
await api.kv.set(userId, "challenge", "abc", { ttlMs: 5 * 60_000 });
await api.kv.del(userId, "nickname");
```

`set` takes an optional `{ ttlMs }` - expired rows read as missing and
are swept by `purgeExpiredModuleData`. Below this, `services.valkey` is
raw Valkey for hot ephemeral state (cooldowns, windows, locks).

## Module files

Per-module directory under `data/files/<module>/` for anything that must
be bytes on disk (exports, snapshots, generated images):

```ts
await api.files.write("backup.json", JSON.stringify(data));
await api.files.read("backup.json");   // Buffer | null
await api.files.list("backups/");
await api.files.del("backup.json");
await api.files.dir();
```

Paths are traversal-guarded to the module dir. Config and small state
belong in config/KV, not here.

## Shared tokens

Third-party API keys owned centrally, read per guild (`SharedApiToken`,
`system.tokens.*` RPC owner-only):

```ts
await api.tokens.get("weather");
```

Bot owners can also set/remove values over Discord with `/tokens set`
and `/tokens remove` (`src/modules/core/commands/Tokens.ts`). Values
are validated to the same bounds as the RPC (service 1-64 chars, token
1-2000 chars) and never echoed back. Prefer the dashboard for pasting
secrets; slash replies are ephemeral but prefix replies are not.

## Bundled data

Read-only files shipped inside an installed addon, rooted at
`data/installed-modules/<module>/`:

```ts
import { readBundledFile } from "#lib/module-system/ModuleFiles.js";

const buf = await readBundledFile("my-addon", "data/quests.json");
```

Paths run through the same traversal guard as module files and missing
files read as `null`. Bundled data is read-only by design, so the
addon validator needs no rule for it: addons never write outside their
own `data/files/<module>/` dir.

## Moderation hierarchy

`src/lib/api/moderation/Hierarchy.ts` centralizes staff-rank checks over
Discord-native signals. There is no admin/mod role config in the mod or
security schemas, so `isAdmin` is guild-owner-or-Administrator and
`isMod` adds the Kick/Ban/Moderate/Manage-Messages permissions.
`respectsHierarchy(actor, target)` is a strict top-role comparison with
the same semantics as `checkHierarchy` in `ModerationFlow.ts`, which
remains the enforcement point for flow-based commands. Direct action
callers can opt into the same guard: `KickAction.apply` accepts an
optional `actor` member and throws `PermissionDenied` when the actor is
outranked (guild-owner bypass included).

## Feature flags

Hash-rollout flags with per-guild overrides
(`src/lib/feature-flags/Index.ts`):

```ts
if (await api.flag("filter-autolockdown")) {}
```
