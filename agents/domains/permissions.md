# Permissions (Permit Nodes)

> The dashboard's permit editor lives in the separate
> [`lumi-devs/lumi-dashboard`](https://github.com/lumi-devs/lumi-dashboard) repo.

## The vocabulary

There is no static registry. The permit vocabulary is read live off each
command's own `requiredPermit` field wherever the full list is needed. A grant
ending in `.*` matches its bare namespace and anything under it, including
nodes that don't exist yet — the list is a discoverability convenience, not an
enum enforced at the resolver.

Wildcard semantics live in `permit-resolver.ts:18-33` (`evaluateNodeMatch`):
`"*"` grants everything; `mod.*` matches `mod` and `mod.anything`.

## How a command declares one

`requiredPermit?: string` on `CommandDef` (and per-subcommand on
`SubcommandHandler`, `packages/core/src/lib/commands/command-def.ts:21,33`).
`sayDef` sets `requiredPermit: "mod.say"`
(`packages/core/src/modules/mod/commands/say.ts:11`). Enforcement is in
`command-dispatch.ts`: the `LumiPermission` gate (`:46-53`) plus
`authorize(..., { kind: "permit", node })` (`:392-410`).

`defaultMemberPermissions` (`command-def.ts:35`) is a separate explicit field —
Discord's client-side grey-out hint, never derived from the node prefix, and
not the actual authorization check. There is no `/permit` bot command; permits
are managed from the dashboard only.

## Autocomplete over the vocabulary

Guild-scoped suggestion lists filter through the same shared helpers as
everything else (`filterAutocompleteChoices` + `respondWithChoices`,
`packages/core/src/lib/utilities/autocomplete.ts`, 25-choice cap). See
`autocomplete.md`.
