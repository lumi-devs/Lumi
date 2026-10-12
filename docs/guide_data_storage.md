# Storing Addon Data

Module state lives in exactly one of two places: typed config for
operator-facing settings, KV for module-owned runtime state. Anything
else is an escape hatch below.

## Typed config first

Declare the shape once in `Index.ts` with the `cfg.*` helpers so the
dashboard, validation, and docs all agree:

```ts
export default defineModule({
  name: "my-module",
  configSchema: cfg.object({
    greeting: cfg.string({ label: "Greeting", description: "...", default: "hi" }),
  }),
});
```

Bind it at runtime with defaults for typed access:

```ts
const Defaults = { greeting: "hi", limits: { max: 5, allowlist: [] as string[] } };
const api = createModuleApi(services, "my-module", Defaults, guildId);
await api.config.get("greeting");
await api.config.set("greeting", "yo");
await api.config.getAll();
await api.config.clear("greeting");
```

`get` falls back to your defaults when nothing is stored. `getAll`
merges defaults with every stored layer. Reads cascade through scopes
(`configFor({ kind: "channel", id })` etc.), writes land on the exact
scope. Full scope table: `framework_config.md`.

Nested documents do not need a full rewrite. `getPath`/`setPath` walk
a key path (`["limits", "max"]`, array segments are numeric strings)
and `setPath` clones along the path so siblings survive:

```ts
await api.config.setPath("limits", ["allowlist", "0"], "123");
const max = await api.config.getPath("limits", ["max"]);
```

## Escapes, in order

When config is the wrong shape, step down exactly one rung:

1. `api.kv` - per-target runtime state (`set(userId, key, value, { ttlMs })`).
2. `api.files` - bytes on disk under `data/files/<module>/` (exports, snapshots).
3. `api.tokens` - centrally owned third-party keys.
4. `services.valkey` - hot ephemeral state (cooldowns, windows).
5. `services.db.*` repositories - relational data with queries and indexes.

Never store bytes in config/KV, never store operator tunables in KV.

## Races: use mutate

`get` then `set` loses concurrent writes. `mutate` runs the whole
read-modify-write under the guild config lock and releases it even
when `fn` throws:

```ts
const next = await api.config.mutate("counter", (current) => current + 1);
```

Reach for it for toggles, counters, and list appends. The same lock
backs `configUtility.setConfig`/`toggleConfigBool`, so mixed callers
serialize against each other.

## KV vs config rule of thumb

Config when an operator should see it: dashboard-editable, audited,
scoped per guild/channel/role/user, cached. KV when only the module
cares: keyed by target id (usually a user), optionally expiring,
invisible to operators. If you are unsure, it is config.
