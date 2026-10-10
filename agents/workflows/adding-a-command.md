# Adding a command to an existing module

Worked example: `packages/core/src/modules/mod/commands/say.ts` (single action)
and `lock.ts` (subcommand group via `handlers`). Background:
`agents/domains/permissions.md`, `agents/domains/ui-components.md`,
`agents/conventions/i18n.md`.

## 1. File location

`packages/core/src/modules/<module>/commands/<name>.ts` — one file per command.
A subcommand group (`lock enable`/`lock disable`) is still one file, with one
entry per subcommand in `handlers` plus `defaultSub`.

## 2. The `CommandDef` shape

```ts
import type { CommandDef } from "@lumi/lib/commands/command-def.js";

export const sayDef: CommandDef = {
  name: "say",
  description: "Relay a message through the bot into a channel",
  guildOnly: true,
  requiredPermit: "mod.say",
  prefixEnabled: true,
  build: () => new SlashCommandBuilder().setName("say")/* ...options... */,
  run: async (ctx: CommandContext) => { /* ... */ },
};
```

- `guildOnly` — every command touching guild state sets it; without a guild the
  dispatch layer rejects before `run`.
- `requiredPermit` — set the moment the command is moderation-adjacent or
  destructive (`command-dispatch.ts` gates on it). A command without one runs
  for anyone who can see it. `defaultMemberPermissions` is a separate explicit
  field — only a Discord client-side hint, never the real check.
- `module: "<name>"` — only needed if the command respects the module's
  per-guild toggle; omit it and the command runs regardless.
- `prefixEnabled: true` — generates the text-prefix bridge from the same
  `run()` unless the command genuinely needs interaction-only features.
- Subcommands: `handlers: { enable: async (ctx) => ..., disable: ... }` with
  `defaultSub: "enable"` (`lock.ts:75,113`) instead of hand-rolled dispatch.

No classes, no decorators, no `registerApplicationCommands` override — `build()`
returns the `SlashCommandBuilder` directly.

## 3. Reading options and replying

Inside `run(ctx)`, pull options off `ctx`, never the raw interaction:
`ctx.getString("message", { required: true, rest: true })`
(`rest: true` consumes the remainder on the prefix bridge, so `!say #general
hello there` needs no quoting), `ctx.getUser`, `ctx.getChannel`.

Defer before slow work (`await ctx.defer()`); skip it only if everything fits
in Discord's 3s ack window. Replies go through
`ctx.replySuccess`/`replyError`/`replyWarning`/`replyInfo` — never a raw
payload. A *separate* message elsewhere (DMing a user) uses the same card
builders + a direct send.

## 4. Autocomplete, only for a bounded-choice option

Set `autocomplete: async (services, interaction) => ...` on the def and funnel
through `filterAutocompleteChoices` + `respondWithChoices`
(`@lumi/lib/utilities/autocomplete.js`) — never `interaction.respond` directly.
See `agents/domains/autocomplete.md`.

## 5. i18n

`applyLocalizedBuilder` from `@lumi/lib/i18n/index.js` for command/option
name/description (single `en-US` locale today — just add the key there, no
mirror files). Runtime reply text via bound `t(...)`. See `i18n.md`.

## 6. Tests

Per `testing.md`: `packages/core/tests/modules/<module>/`. Stub `container`
fields directly (`db`, `valkey`, `logger` as `vi.fn()`s) rather than live
services; one `it` per behavior. Thin commands are best tested one layer down,
on the helper they call.
