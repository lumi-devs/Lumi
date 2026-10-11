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

## Feature flags

Hash-rollout flags with per-guild overrides
(`src/lib/feature-flags/Index.ts`):

```ts
if (await api.flag("filter-autolockdown")) {}
```
