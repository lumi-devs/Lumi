# Framework: Permits

Permit nodes (`mod.ban`, `admin.*`) gate commands and actions. All
decisions go through `authorize()` (`src/lib/permissions/Authorize.ts`) -
never touch `PermitResolver` directly from command, precondition, or RPC
code.

## Evaluation order

For one `(guild, node, actor)` the resolver walks tiers top to bottom and
stops at the first tier holding any rule for the node:

1. Bot owner bypass (always allows).
2. Enforced user rules.
3. Custom user rules.
4. Channel rules.
5. Role rules, in Discord role-position order.

Deny wins over grant inside a tier. No rule anywhere means deny.

## Use

```ts
export const banDef: CommandDef = {
  name: "ban",
  requiredPermit: "mod.ban",
  ...
};

await api.permits.check("mod.ban", { userId, roleIds, channelId });
const ok = await api.permits.allows("mod.ban", { userId });
```

`check` throws a user-facing error on deny; `allows` returns a boolean.
`requiredPermit` on a `CommandDef` enforces before `run`.

Assignment chains are Valkey-cached per target with invalidation on
permit writes, so per-command evaluation stays off Postgres on the hot
path.

## Access lists

Separate from permits: the global/server blocklist and allowlist
(`/access block|allow`, owner-only). Evaluation (`AccessLists` gate, runs
before every command): blocked anywhere → deny; if any allowlist is
non-empty for the scope, the user must be listed; otherwise allow.

## Display order

Permits carry a `position` integer used only for listing order. Reorder
via the `guild.permits.move` RPC action, the hub panel (`↕ Order`), or
the dashboard. Order never affects evaluation.
