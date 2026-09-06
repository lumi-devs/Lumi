# Adding a command to an existing module

Worked example: `packages/core/src/modules/mod/commands/say.ts` and
`dm.ts` — two small, real commands added to the `mod` module this session,
plus `lock.ts` for the subcommand-group variant. Background:
`agents/domains/permissions.md` (permit gating), `agents/domains/ui-components.md`
(reply helpers), `agents/conventions/i18n.md` (localized builders).

## 1. File location

`packages/core/src/modules/<module>/commands/<name>.ts` — one file per command,
default export not required (`say.ts`/`dm.ts` use a named export, `afk.ts` uses
`export default`; both work, `ModuleStore`'s command loader accepts either).
A subcommand group (multiple `/thing sub1|sub2`) is still one file
(`lock.ts` handles `enable`/`disable` in one class) — it doesn't get its own
subdirectory.

## 2. Pick `BaseCommand` or `BaseSubcommand`

Both live in `#lib/commands.js`. Use `BaseCommand` for a single-action command
(`say`, `dm`); use `BaseSubcommand` (built on `@sapphire/plugin-subcommands`)
the moment the command has more than one verb (`lock enable`/`lock disable`,
`/permit create|remove|list`). Don't hand-roll subcommand dispatch inside a
single `run()` with a switch on an option value — the subcommand-group pattern
gets you separate `registerApplicationCommands` subcommand builders and
separate handler methods for free.

## 3. `@ApplyOptions` — the fields that matter

`say.ts:8-14`:

```ts
@ApplyOptions<BaseCommand.Options>({
  name: "say",
  description: "Relay a message through the bot into a channel",
  preconditions: ["GuildOnly"],
  requiredPermit: "mod.say",
  prefixEnabled: true,
})
export class SayCommand extends BaseCommand {
```

- `preconditions: ["GuildOnly"]` — every command interacting with guild state
  needs this; a DM-only or context-agnostic command omits it. `BaseCommand`'s
  constructor already appends `MaintenanceMode` and `ModuleEnabled`
  automatically (`commands.ts:453-455`) — don't add those yourself.
- `requiredPermit` — set this the moment the command does anything
  moderation-adjacent or destructive. Appending it wires the `RequirePermit`
  precondition and a `defaultMemberPermissions` Discord-UI hint automatically
  (`commands.ts:124,133`) — see `agents/domains/permissions.md` for the full
  mechanics and the two-file node registration you also need to do. A command
  with no `requiredPermit` runs for anyone who can see it (subject to whatever
  `preconditions` you did add) — `afk`'s own `/afk` command has none.
- `module: "<name>"` — only needed if the command should respect the module's
  per-guild enable/disable toggle. `say`/`dm`/`lock` don't set it because they
  belong to `mod`, which almost every server keeps enabled and isn't
  independently toggled per-command; `afk.ts:38` sets `module: "afk"` because
  `AfkModule` is itself disableable.
- `prefixEnabled: true` — generates the equivalent text-prefix command handler
  automatically from the same `run()` (or per-subcommand methods). Set it
  unless the command genuinely can't work as a text command (e.g. needs a
  Discord-only interaction feature).
- `cooldownLimit` / `cooldownDelay` — add only if the command is cheap enough
  to spam; `afk.ts:40-41` sets `cooldownLimit: 2, cooldownDelay: 5000`, `say`/
  `dm`/`lock` set neither (moderation actions are naturally rate-limited by who
  has the permit).

## 4. `registerApplicationCommands`

Plain builder calls when there's no i18n need to localize the whole thing yet
(this is what `say`/`dm`/`lock` actually do — none of the three use
`applyLocalizedBuilder`, they set `.setName()`/`.setDescription()` directly):

```ts
public override registerApplicationCommands(registry: ApplicationCommandRegistry) {
  registry.registerChatInputCommand((b) =>
    b
      .setName(this.name)
      .setDescription(this.description)
      .addStringOption((o) =>
        o.setName("message").setDescription("Message to send")
          .setRequired(true).setMaxLength(MaxMessageLength),
      )
      .addChannelOption((o) =>
        o.setName("channel").setDescription("Channel to send in (defaults to this one)")
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
          .setRequired(false),
      ),
  );
}
```

But if you want the command's name/description/option text to actually
participate in Discord's localization map (translated client-side per user
locale) and the i18n key-parity test, use `applyLocalizedBuilder` instead —
this is the pattern in most of the older `mod` commands (`kick.ts`, `warn.ts`,
`quarantine.ts`) and is what `agents/conventions/i18n.md` documents in detail:

```ts
import { applyLocalizedBuilder } from "@sapphire/plugin-i18next";

registry.registerChatInputCommand((b) =>
  applyLocalizedBuilder(b, "commands:kick").addUserOption((o) =>
    applyLocalizedBuilder(o, "commands:kickMember").setRequired(false),
  ),
);
```

`"commands:kick"` resolves `kickName`/`kickDescription` from
`en-US/commands.json` automatically — you don't call `t()` for this, and you
need the matching `<key>Name`/`<key>Description` entries in every locale's
`commands.json` (see the i18n doc's four-file workflow) or the key-parity test
fails. `say`/`dm`/`lock` being hardcoded English strings instead is a real gap
in this repo, not a pattern to copy for a genuinely new command going forward
— prefer `applyLocalizedBuilder` for anything new.

For a subcommand group, build each subcommand's builder the same way, nested
under `.addSubcommand(...)` (`lock.ts:40-73`).

## 5. Reading options and replying

Inside `run(ctx: CommandContext)` (or a named subcommand method for
`BaseSubcommand`), pull options off `ctx`, never the raw interaction:

```ts
const target = await ctx.getUser("user", { required: true });
const message = await ctx.getString("message", { required: true, rest: true });
const channel = await ctx.getChannel("channel");
```

`{ rest: true }` on `getString` (used by both `say` and `dm`) matters for the
prefix-command bridge — it means "consume the remainder of the message" so a
prefix invocation like `!say #general hello there` doesn't need quoting.

Long-running work (anything touching the Discord API beyond the reply itself)
should `await ctx.defer()` first — `lock.ts:88` defers before calling
`lockChannel`/`unlockChannel`. `say`/`dm` skip `defer()` since a single
`channel.send`/`target.send` call is fast enough to fit in Discord's 3s ack
window; if you're unsure, defer.

Replies always go through `ctx.replySuccess`/`replyError`/`replyWarning`/`replyInfo`
— never build an `EmbedBuilder` or a raw reply payload by hand (see
`agents/domains/ui-components.md`). All three real examples do this
consistently:

```ts
return ctx.replySuccess("Message Sent", `Relayed your message to ${channel}.`);
return ctx.replyError("Invalid Channel", "Pick a text channel the bot can send messages in.");
```

If a command needs to send a *separate* message somewhere else (not a reply to
the invoking interaction — `dm.ts:45-49` DMing the target user), build that one
message with `makeInfoCard`/`makeSuccessCard`/etc. directly and send it via
`target.send(card)` — same card builders, just not through `ctx.reply`.

## 6. Autocomplete, only for a bounded-choice string/number option

If an option's valid values are a real, discoverable, bounded set at runtime
(an existing permit node, an existing module name, a repo name) rather than
free text, wire `autocompleteRun`. Real example, `core/commands/permit.ts:146-193`:

```ts
public override async autocompleteRun(interaction: AutocompleteInteraction): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) return respondWithChoices(interaction, []);

  const focused = interaction.options.getFocused(true);
  if (focused.name === "node") {
    return respondWithChoices(
      interaction,
      filterAutocompleteChoices(KnownPermitNodesAutocomplete, focused.value),
      permitNodeLabel,
    );
  }
  return respondWithChoices(interaction, []);
}
```

Both helpers come from `#utilities/autocomplete.js`:
`filterAutocompleteChoices(values, focused, limit?)` does the case-insensitive
substring match and truncates to Discord's 25-choice cap;
`respondWithChoices(interaction, values, labelFn?)` calls
`interaction.respond(...)`, mapping each value through an optional label
function and truncating to Discord's 100-char choice-text limit. Don't call
`interaction.respond` directly or hand-roll the filter/cap logic — every
autocomplete handler in the repo funnels through these two functions. This
doesn't apply to `addRoleOption`/`addChannelOption`/`addUserOption`/
`addMentionableOption` — those already get a native Discord picker.

## 7. i18n

Follow `agents/conventions/i18n.md`'s four-file workflow if you used
`applyLocalizedBuilder`: add the key to `en-US/<namespace>.json`, add the
matching TS constant under `keys/commands/<module>.ts`, mirror the key
(same English value) into every other locale's JSON, and consume runtime
reply text via the typed `t(Root.SomeKey)` constant, not a raw string —
`ctx.fetchT()` gives you the bound `LumiT` (see `afk.ts:59`).

## 8. Tests

Per `agents/conventions/testing.md`, a new command's test goes in
`packages/core/tests/modules/<module>/`. Mock `@sapphire/framework`'s
`container` (redis/db/logger as plain `vi.fn()` stubs) rather than hitting
real Postgres/Redis, and write one `it` per actual behavior
(`'locks a channel that is not yet locked'`, not `'works'`). If the command's
own logic is thin (mostly option-reading and a reply), the more valuable test
usually lives one layer down — on whatever helper it calls (`lockChannel`/
`unlockChannel` in `#lib/moderation/lockdown.js`, for `lock.ts`) — check
`packages/core/tests/modules/mod/channel-lock.test.ts` for that split.
