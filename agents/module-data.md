# Module data helper

`services.helpers.moduleData` is the generic durable store for per-guild module
state that does not warrant its own table or typed helper namespace.

Source: `packages/db/src/helpers/moduleData.ts`; Prisma model `ModuleData`;
schema export type `ModuleDataEntry`.

## Shape

A row is keyed by `(guildId, moduleName, targetId, key)` and stores an arbitrary
JSON `value` plus an optional `expiresAt`. `targetId` scopes the value to a
user, channel, message, or any feature-specific id; use a stable sentinel such
as the guild id when the value is guild-wide.

```ts
await services.helpers.moduleData.set(guildId, moduleName, targetId, key, value, {
  ttlMs: 60_000,
});
const value = await services.helpers.moduleData.get<T>(
  guildId,
  moduleName,
  targetId,
  key,
);
```

## Rules

- Use the loaded module name (`services.moduleName` where available) as
  `moduleName`; do not share one namespace across modules.
- Values are cached for 60 seconds by default. Mutations invalidate through the
  helper; do not write the table directly.
- Expired rows are treated as absent and cleaned up lazily.
- Store JSON-serializable values. Prefer a small explicit object shape over
  nested blobs.
- Use typed helpers (`economy`, `leveling`, `tickets`, and so on) when the data
  has real relational structure or cross-row queries. `moduleData` is for
  feature-local key/value state.
- Never read `prisma` or the cache client directly from module code.
