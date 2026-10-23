# Permits and access control

Code: `packages/module-kit/src/permits.ts`, `packages/db/src/repositories/permits.ts`.
Panel: `apps/bot/src/lumi/` (`/lumi` → Permissions). Command: `/permit`.
Both require `admin.*`; Discord managers (`Administrator` or `ManageGuild`) also
pass because the resolver's manager tier always allows. A custom `admin.*` role
or user can therefore use the panel and command without raw Discord admin.

## Evaluation

`evaluatePermit(services, options)` resolves one node (`mod.ban`, `admin.*`) for
one user, channel, and member. Tiers run in this order and the first decisive
tier wins:

1. **owner** — `OWNER_IDS` or an application/team owner. Always allows.
2. **owner pass** — emitted for auditability when the user is not the owner.
3. **manager** — `Administrator` or `ManageGuild`. Always allows.
4. **enforced:user** — permits with `kind = enforced`, assigned to the user.
5. **custom:user** — custom permits assigned to the user.
6. **custom:channel** — custom permits assigned to the current channel.
7. **custom:role:<id>** — custom permits assigned to each role, in cache order.

A tier is `allow`, `deny`, or `pass`. Deny is checked before grant inside one
rule bucket. The resolver keeps evaluating after the deciding tier so the
explain panel can show the whole chain.

## Quarantine

While a member is quarantined (Redis `lumi:quarantine:<guild>:<user>`), custom
tiers are still explained but never decide. Enforced tiers still apply. This
matches Lumi v1: quarantine suspends custom grants, not explicitly enforced
rules.

## Node matching

`matchPermitNode(granted, required)`:

- `*` matches everything.
- `mod.*` matches `mod` and `mod.ban`, but not `modular.ban`.
- Otherwise the strings must match exactly.
- Empty nodes never match.

## Storage and cache

- `permit` rows hold name, kind, polarity, node list, priority `position`, and a
  `builtin` flag.
- `permitAssignment` rows target user, role, or channel. Enforced permits are
  user-only.
- Built-in permits (`Extra Owner` = `*`, `Trusted Admin` = `admin.*`) are seeded
  on guild join, ready backfill, and permit creation. Never seed them from a read
  path.
- Evaluation caches a payload per `(guild, targetType, targetId)` for five
  minutes. Any assignment change invalidates that target. Priority changes
  (`move`, `reorder`) invalidate every assignment cache in the guild because
  order is part of the payload.

## Panel

`/lumi` → Permissions lists assignments, assigns custom rules to roles and
enforced rules to users, revokes, reorders, and explains a node. Explain uses the
channel the panel was opened in, so channel rules are included. The panel state is
encoded in custom IDs; the invoking user is recorded in
`lumi:panel:<messageId>` and every interaction checks it.

## Adding a command

Set `permitNode` on the command definition. Dispatch evaluates it after Discord
permissions and before the module gate. Do not implement permit checks inside the
command body.
