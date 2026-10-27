# Permits and access control

Code: `packages/permits/src/`.
Panel: `src/admin/panel/PermitPanel.ts` (`/lumi` → Permissions → Open
Permit Panel). Commands: `/permit create`, `/permit explain`.
`/lumi` and `/permit` require **Manage Server** or an `admin.*`/`*` permit for
both slash and prefix use. Permit-only holders can see and run the slash
commands because no Discord default permission hides them.
The resolver's manager tier still treats Discord `Administrator` or `ManageGuild`
as an allow when evaluating nodes.

## Evaluation

`evaluatePermit(options, container)` resolves one node (`mod.ban`, `admin.*`)
for one user, channel, and member. Tiers run in this order and the first
decisive tier wins:

1. **owner** — `OWNER_IDS` or the guild owner. Always allows.
2. **manager** — `Administrator` or `ManageGuild`. Always allows.
3. **custom:user** — permits assigned to the user.
4. **custom:channel** — permits assigned to the current channel.
5. **custom:role:<id>** — permits assigned to each role, in cache order.

A tier is `allow`, `deny`, or `pass`. Deny is checked before grant inside one
rule bucket. Custom tiers are walked in chain order and the first decisive tier
wins; later tiers are still rendered for Explain Check.

`PermitRepository.explainPermitNodes` evaluates a whole node catalog from one
permit-chain fetch. Single-node checks use `evaluatePermit`.
`PermitRepository.hasGrantNode` walks only the custom tiers, so it can distinguish
an `Extra Owner` grant from a Discord manager or guild owner.

## Quarantine

While a member is quarantined (Redis `lumi:mod:<guild>:quarantine:<user>`),
custom tiers are still explained but never decide. This matches Lumi v1:
quarantine suspends custom grants.

## Node matching

`evaluateNodeMatch(granted, required)`:

- `*` matches everything.
- `mod.*` matches `mod` and `mod.ban`, but not `modular.ban`.
- Otherwise the strings must match exactly.
- Empty nodes never match.

## Storage and cache

- `permit` rows hold a guild-local `number`, name, a node list, polarity
  (`Grant` or `Deny`), priority `position`, optional
  expiry/schedule/conditions, and a `builtin` flag. The global `id` remains the
  storage key; `number` is the visible per-guild label. New permits take the
  smallest free number in the guild, so deleting a permit reuses its number.
- `permitAssignment` rows target user, role, or channel and may carry their own
  expiry. Built-in permits only accept user assignments.
- Built-in permits (`Extra Owner` = `*`, `Trusted Admin` = `admin.*`) are seeded
  on guild join and ready backfill. Never seed them from a read path.
- Only bot owners (`OWNER_IDS`) can create, edit, assign, or delete a permit
  containing `*`. Guild `Extra Owner` holders cannot create another Extra Owner.
- Add-on management is separate from admin-panel access: it requires a bot owner
  (`OWNER_IDS`). `Extra Owner` (`*`) and `Trusted Admin` (`admin.*`) can open the
  hub but cannot add repositories, install modules, or change updates.
- Expired permits and expired assignments are ignored, as are permits whose
  schedule, timezone, or conditions do not match the evaluation time and context.
## Panel

`/lumi` → Permissions lists permits by guild number, opens details, creates
permits, assigns users, roles, and channels, revokes assignments, and explains
permissions. Built-in permits only accept user assignments.
Create, Explain, and Assign use Components V2 selects instead of modals; Create
also opens a name modal, and Edit remains a modal. One permit holds every
selected node. Explain selects a member and evaluates every catalog node at
once, grouping the results into allowed, denied, and no-explicit-permit lists.

Selection state is held in memory per panel message and invoking user. Every
selection re-renders the card in place. Panels have no close buttons; if one is
added, it must delete the message rather than edit it. Panels are ephemeral and
require **Manage Server** or an `admin.*`/`*` permit to interact with.
`/permit create` and `/permit explain` expose the same operations without the
hub, with node autocomplete from built-ins, modules, and existing custom nodes.
Create accepts a comma-separated node list for one permit. `/permit explain`
accepts one node or, when the node is omitted, runs the full catalog check. It
also accepts an optional channel for channel-scoped rules.

## Adding a command

Set `.setDefaultMemberPermissions(...)` for Discord access; prefix dispatch
enforces the same `default_member_permissions` value as slash commands. Set
`requiredPermit` on module commands so the permit node catalog and `/permit`
autocomplete include their nodes.
