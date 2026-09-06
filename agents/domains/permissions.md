# Permissions (Permit Nodes)

Grounded in `packages/core/src/lib/permissions/`, `apps/dashboard/src/lib/permit-nodes.ts`,
and `packages/core/tests/core/permit_autocomplete.test.ts`.

## The vocabulary

`packages/core/src/lib/permissions/permit-nodes.ts` is the canonical list — dot-notation
strings grouped by prefix (`admin`, `mod`, `economy`, `reactionroles`, `owner`):

```ts
// permit-nodes.ts:6-29
export const KnownPermitNodeGroups: { prefix: string; nodes: string[] }[] = [
  { prefix: "admin", nodes: ["admin.*", "admin.config", "admin.welcome"] },
  {
    prefix: "mod",
    nodes: [
      "mod.*", "mod.lockdown", "mod.notes", "mod.softBan",
      "mod.voiceMute", "mod.say", "mod.dm",
    ],
  },
  { prefix: "economy", nodes: ["economy.*", "economy.admin"] },
  { prefix: "reactionroles", nodes: ["reactionroles.*", "reactionroles.manage"] },
  { prefix: "owner", nodes: ["owner.*", "owner.serverlock", "owner.leave", "owner.announce"] },
];
```

`mod.say` and `mod.dm` are the most recently added nodes in this file — a live template for
adding the next one (see below).

**Wildcard semantics** live in `PermitResolver.ts:16-29` (`evaluateNodeMatch`), not in the
node list itself:

```ts
export function evaluateNodeMatch(grantedNode: string, requiredNode: string): boolean {
  if (!grantedNode || !requiredNode) return false;
  if (grantedNode === "*" || grantedNode === requiredNode) return true;
  if (grantedNode.endsWith(".*")) {
    const namespace = grantedNode.slice(0, -2);
    return requiredNode === namespace || requiredNode.startsWith(namespace + ".");
  }
  return false;
}
```

So `"*"` grants everything; a granted node ending in `.*` (e.g. `mod.*`) matches its own bare
namespace (`mod`) and anything prefixed `mod.` — including nodes that don't exist yet in
`KnownPermitNodeGroups`. The node list is a UI/autocomplete convenience, not an enum enforced
at the resolver — `evaluateNodeMatch` will happily match a made-up `mod.newthing` node against
a `mod.*` grant with no code changes required on the resolver side. What actually requires
registering the node in the list above is discoverability: `/permit create`'s autocomplete and
the dashboard's permit editor only ever suggest nodes from this list.

## How a command declares one

`requiredPermit` is a field on `BaseCommand.Options`/`BaseSubcommand.Options`
(`#lib/commands.js` — `LumiCommandExtras.requiredPermit`, `commands.ts:144`). Setting it does
three things automatically, all inside `BaseCommand`/`BaseSubcommand`'s constructor and
`parseConstructorPreConditions` override:

1. Appends the `RequirePermit` precondition (`appendPermitPrecondition`, `commands.ts:133`,
   called from `parseConstructorPreConditions`, `commands.ts:449-456`).
2. Derives a Discord-side `defaultMemberPermissions` gate as a fallback UI hint —
   `mapRequiredPermitToDiscordPermission` (`commands.ts:124`) maps an `admin`-prefixed node to
   `ManageGuild` and a `mod`-prefixed node to `ManageMessages`; this is *not* the actual
   authorization check, just what Discord shows/greys out client-side before the interaction
   even reaches the bot.
3. `RequirePermit` (`permissions/preconditions/RequirePermit.ts`) is the actual gate — it
   calls into `PermitPrecondition`/`PermitResolver.hasPermit` at run time.

Real example, `mod/commands/say.ts:8-14`:

```ts
@ApplyOptions<BaseCommand.Options>({
  name: "say",
  description: "Relay a message through the bot into a channel",
  preconditions: ["GuildOnly"],
  requiredPermit: "mod.say",
  prefixEnabled: true,
})
export class SayCommand extends BaseCommand { ... }
```

`core/commands/permit.ts:20-25` shows the subcommand-group form — the `/permit` command
itself requires `admin.*` to touch:

```ts
@ApplyOptions<BaseSubcommand.Options>({
  name: "permit",
  preconditions: ["GuildOnly"],
  requiredPermit: "admin.*",
  ...
})
```

## Wiring a new node into both surfaces

Two files, kept manually in sync (there is no codegen or shared source-of-truth file — the
dashboard file's own doc comment says so): `packages/core/src/lib/permissions/permit-nodes.ts`
and `apps/dashboard/src/lib/permit-nodes.ts`.

The core file is a flat `{ prefix, nodes: string[] }[]` plus an emoji lookup
(`PermitNodeEmoji`, `permit-nodes.ts:31-50`) used only for `/permit`'s autocomplete label —
`permitNodeLabel(node)` (`permit-nodes.ts:55-57`) renders `"📢 mod.say"` for the dropdown text
while the underlying `value` sent to Discord stays the bare node string.

The dashboard file is a *richer* mirror — same prefixes/order, but each node is
`{ node, label, description }` instead of a bare string, because the dashboard's permit editor
needs human-readable copy, not an emoji:

```ts
// apps/dashboard/src/lib/permit-nodes.ts:60-69
{
  node: "mod.say",
  label: "Relay messages",
  description: "Send a message through the bot into any channel.",
},
{
  node: "mod.dm",
  label: "Relay direct messages",
  description: "Send a direct message through the bot to any user.",
},
```

Adding a node means: append to the core file's group array + its emoji entry, then append the
matching `{ node, label, description }` object to the dashboard file's matching group. Nothing
else needs to change — `KnownPermitNodesAutocomplete` (core,
`permit-nodes.ts:52-53`) and `KnownPermitNodes` (dashboard, `permit-nodes.ts:129-131`) are both
derived via `flatMap` over the groups, so both autocomplete-source lists update for free.

## How `/permit`'s autocomplete actually resolves

`PermitCommand.autocompleteRun` (`core/commands/permit.ts:146-193`) is the wiring point. It
branches on `focused.name`:

- `"node"` — if the active subcommand is `remove` and a permit `name` is already typed, it
  fetches that specific permit's own current `nodes` array and filters *those* instead of the
  global vocabulary (`permit.ts:156-169`) — you can only remove a node the permit actually has.
  Otherwise it filters `KnownPermitNodesAutocomplete` and labels each with `permitNodeLabel`
  (`permit.ts:171-175`).
- `"name"` — suggests existing permit names for this guild via
  `getUtility("permissions").listPermits(guildId)`, except on `create` where there's nothing
  to suggest yet (`permit.ts:178-190`).

Both branches funnel through the two shared helpers in
`packages/core/src/lib/utilities/autocomplete.ts`:

```ts
export function filterAutocompleteChoices(
  values: string[], focused: string, limit = AutocompleteChoiceLimit,
): string[] {
  const query = focused.trim().toLowerCase();
  const matches = query
    ? values.filter((value) => value.toLowerCase().includes(query))
    : values;
  return matches.slice(0, limit);
}
```

`AutocompleteChoiceLimit = 25` (`autocomplete.ts:4`) is Discord's hard cap on autocomplete
choices — `respondWithChoices` (`autocomplete.ts:19-30`) is what actually calls
`interaction.respond(...)`, mapping each surviving value through an optional `label` function
and truncating both `name` and `value` to Discord's 100-character choice-text limit.

`packages/core/tests/core/permit_autocomplete.test.ts` exercises this exactly: case-insensitive
substring match (`"MOD"` still matches `mod.say`/`mod.dm`, test at line 84-101), the 25-choice
cap when a guild has 40+ permits (test at line 149-161), and the guild-less DM case returning
`[]` outright (line 163-171, since permits are guild-scoped and there's nothing to suggest
without a `guildId`).
