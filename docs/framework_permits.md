# Framework: Permits

Permit nodes (`mod.ban`, `admin.*`) gate commands and actions. All
decisions go through `authorize()` (`src/lib/api/permissions/Authorize.ts`) -
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

## Default member permissions

`defaultMemberPermissions` on a `CommandDef` sets Discord's
default_member_permissions at slash sync. Members lacking those bits
don't see the command; server owners, administrators, and per-command
Integration overwrites bypass it. This is display-level hiding only —
`requiredPermit` and the gates above still decide at execution.

## Explaining a decision

`explainPermit(node, actor)` (`src/lib/api/permissions/PermitResolver.ts`)
walks the same tiers as the resolver — owner, manager, enforced user,
then one custom row per chain tier (`user`, `channel`, `role:<id>`) — and
reports each tier's verdict (`allow` | `deny` | `pass`) without
short-circuiting, so a deny and a later grant both show up. Read-only:
it never writes assignments. Surfaced via `/lumi explain node:<node>
target:<user?>`.

```ts
const rows = await explainPermit("mod.ban", { guildId, userId, roleIds });
```

## Permit-or-Discord-permissions gate

`permitOrPermissions(node, perms)` (`src/lib/api/permissions/PreconditionChecks.ts`)
builds a `GateCheck` that passes when the permit node allows (via
`authorize()`) OR the actor's Discord member permissions satisfy `perms`
(`{ ManageGuild: true }`, flag names from `PermissionFlagsBits`; unknown
names never pass). Discord bits are read from `GateSource.member`,
accepting a `PermissionsBitField`, a raw bigint, or an API-style bitfield
string. Parameterized like `LumiPermission`'s context node, so it is used
where gates are composed rather than as a static registry entry.

```ts
const check = permitOrPermissions("mod.ban", { ManageGuild: true });
const denial = await check(source, {});
```
