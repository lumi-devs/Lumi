# Autocomplete

Grounded in `packages/core/src/lib/utilities/autocomplete.ts`. Commands expose
`autocomplete(services, interaction)` on their `CommandDef` — there is no
Sapphire `autocompleteRun` and no `/permit` command (permits are
dashboard-managed).

## The pattern

`filterAutocompleteChoices` + `respondWithChoices`
(`packages/core/src/lib/utilities/autocomplete.ts`): case-insensitive substring
match, truncated to Discord's 25-choice cap (`AutocompleteChoiceLimit`), with
`name`/`value` clamped to 100 chars on respond. Always used together: filter
first, respond second. `respondWithChoices` is the only thing that calls
`interaction.respond(...)` directly.

Gate behavior lives in `command-dispatch.ts`: no `autocomplete` on the def, or
`guildOnly` without a guild, responds `[]`. Permit-gated suggestions go through
`authorize()` the same way command execution does.

## When to use it, and when not to

Wire `autocomplete` for a STRING/NUMBER option whose valid values are a real,
bounded, runtime-enumerable set: installed/discoverable module and repo names
(`core/commands/module.ts`, `download.ts`, `repo.ts` — helpers
`repoNameChoices`/`repoModuleChoices`/`installedModuleChoices` from
`modules/core/services/downloader-autocomplete.ts`), reason presets
(`ban.ts:146-148` delegates to `respondWithReasonChoices`), duration presets
(`purge.ts:541`: `["5m","10m",...,"14d"]`).

Don't use it for free text (ban reason bodies) or options with a native Discord
picker (`addRoleOption`/`addChannelOption`/`addUserOption`/`addMentionableOption`).

## Worked example: `module.ts`

`packages/core/src/modules/core/commands/module.ts:187-242` branches on
`focused.name` (`repo` vs `module`), then on subcommand: `install` scopes
modules to the already-picked `repo` option, `enable`/`disable` filter
`moduleStore` by current state, fallback lists everything. Domain helpers do
the filtering internally — the command doesn't reimplement cap logic.
