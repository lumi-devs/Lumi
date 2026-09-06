# Autocomplete

Grounded in `packages/core/src/lib/utilities/autocomplete.ts` and the real
`autocompleteRun` implementations in `packages/core/src/modules/core/commands/{permit,module}.ts`
and `packages/core/src/modules/utility/commands/purge.ts`.

## The pattern

Two functions, `packages/core/src/lib/utilities/autocomplete.ts`, used together everywhere
autocomplete is wired up:

```ts
export const AutocompleteChoiceLimit = 25; // Discord's hard cap
const ChoiceTextMaxLength = 100;

export function filterAutocompleteChoices(
  values: string[],
  focused: string,
  limit = AutocompleteChoiceLimit,
): string[] {
  const query = focused.trim().toLowerCase();
  const matches = query
    ? values.filter((value) => value.toLowerCase().includes(query))
    : values;
  return matches.slice(0, limit);
}

export async function respondWithChoices(
  interaction: AutocompleteInteraction,
  values: string[],
  label?: (value: string) => string,
): Promise<void> {
  await interaction.respond(
    values.map((value) => ({
      name: (label ? label(value) : value).slice(0, ChoiceTextMaxLength),
      value: value.slice(0, ChoiceTextMaxLength),
    })),
  );
}
```

`filterAutocompleteChoices` does a case-insensitive substring match (`.toLowerCase().includes`,
not a prefix match — typing `"MOD"` matches `mod.say` because the whole node string is
lowercased before comparison) and truncates to 25 results, matching Discord's autocomplete
choice cap. `respondWithChoices` is the only thing that should ever call
`interaction.respond(...)` directly — it also clamps each choice's `name`/`value` to Discord's
100-character limit, which `filterAutocompleteChoices` does not do on its own.

The two are always used together: filter first, respond second. A command with more than one
autocompletable option branches on `interaction.options.getFocused(true).name` first, then
calls `filterAutocompleteChoices` against whatever value-set is relevant to that option, then
`respondWithChoices`.

## When to use it, and when not to

Use `autocompleteRun` for a STRING/NUMBER option whose valid values are a real, bounded,
discoverable set at *runtime* — permit nodes (`permit.ts`), installed/discoverable module
names and repo names (`module.ts`, `download.ts`, `repo.ts`), existing permit/reaction-role
names, duration presets (`purge.ts`). The set has to actually be enumerable server-side; if you
can produce the candidate list from `container.moduleStore`, a repository query, or a static
array, it's a good fit.

Don't use it for:

- **Free text** — a ban reason, a custom message body (`say.ts`'s `message` option has no
  autocomplete; there's nothing to suggest).
- **Options that already have a native Discord picker** —
  `addRoleOption`/`addChannelOption`/`addUserOption`/`addMentionableOption` render their own
  in-client picker UI; wiring `autocompleteRun` for one of these options is redundant and
  Discord doesn't even let you combine `.setAutocomplete(true)` with these option types the way
  it does with `addStringOption`.

## Worked example: `module.ts`

`packages/core/src/modules/core/commands/module.ts` wires autocomplete for two different
option names (`repo`, `module`) whose valid choices depend on which subcommand is active —
the fullest real example in the codebase:

```ts
public override async autocompleteRun(
  interaction: AutocompleteInteraction,
): Promise<void> {
  const focused = interaction.options.getFocused(true);
  const subcommand = interaction.options.getSubcommand(false);

  if (focused.name === "repo") {
    return respondWithChoices(
      interaction,
      await repoNameChoices(this.downloaderService, focused.value),
    );
  }

  if (focused.name !== "module") return respondWithChoices(interaction, []);

  if (subcommand === "install") {
    return respondWithChoices(
      interaction,
      await repoModuleChoices(
        this.downloaderService,
        interaction,
        "repo",
        focused.value,
      ),
    );
  }

  if (["uninstall", "update", "pin", "unpin"].includes(subcommand ?? "")) {
    const pinned =
      subcommand === "pin" ? false : subcommand === "unpin" ? true : undefined;
    return respondWithChoices(
      interaction,
      await installedModuleChoices(this.downloaderService, focused.value, {
        pinned,
      }),
    );
  }

  if (subcommand === "enable" || subcommand === "disable") {
    const names = this.container.moduleStore
      .all()
      .filter((r) => (subcommand === "enable" ? !r.enabled : r.enabled))
      .map((r) => r.name);
    return respondWithChoices(
      interaction,
      filterAutocompleteChoices(names, focused.value),
    );
  }

  const names = this.container.moduleStore.all().map((r) => r.name);
  return respondWithChoices(
    interaction,
    filterAutocompleteChoices(names, focused.value),
  );
}
```

Notes on what's happening subcommand by subcommand: `install` needs the module list scoped to
whichever `repo` the user already picked (`repoModuleChoices` reads the sibling `repo` option
off the same interaction — that's why it's passed `interaction` and the option name `"repo"`,
not just a raw string); `enable`/`disable` filter `container.moduleStore.all()` down to modules
in the opposite state (you can't "enable" an already-enabled module, so it's not offered); the
fallback branch (used by `info`/`reload`/`help`, effectively) just lists every discovered
module name. `repoNameChoices`/`repoModuleChoices`/`installedModuleChoices` (imported from
`#lib/downloader/autocomplete.js`) are themselves built on `filterAutocompleteChoices` +
`respondWithChoices` internally — this file doesn't reimplement the filter/cap logic, it
delegates to domain-specific helpers that do.

Two smaller examples worth knowing about:

- `mod/commands/ban.ts` and `utility/commands/purge.ts` both autocomplete a `duration` option
  against a fixed preset array (`purge.ts:74-79`: `["5m","10m","15m",...,"14d"]`) rather than
  anything database-backed — a bounded, discoverable set doesn't have to come from a query.
- `core/commands/permit.ts:146-193` (see `permissions.md` for the full walkthrough) shows the
  pattern where the *scope* of one option's suggestions depends on the value already typed into
  another option on the same interaction (`nodes remove`'s `node` choices are scoped to the
  specific permit named in the `name` option).
