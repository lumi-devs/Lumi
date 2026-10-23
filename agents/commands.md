# Commands and dispatch

Built-ins live in `apps/bot/src/commands/` and are wired directly by
`apps/bot/src/runtime/app.ts`. Module commands live in the module directory and arrive
through the loader.

## Built-in vs module

- Built-in command: `module: null`. Always registered, always runnable, cannot be
  disabled or removed.
- Module command: `module: "<name>"`. Registered only while that module is
  loaded; gated per guild at dispatch time.

`/about`, `/ping`, `/help`, `/modules`, `/permit`, `/lumi`, and `/addons` are
built-ins. Module management must never depend on a module being enabled.
`/lumi` is the control-panel command; its panel code lives in
`apps/bot/src/lumi/` and its `lumi:` components/modals are routed through the
global interaction dispatcher. Panel state is encoded in custom IDs, and the
invoking user is remembered in a short-lived Redis panel session so any replica
can handle a click. Add-on repo and install actions inside the Add-ons tab are
Bot Owner only and reuse `services.addons`.

`/help` builds its categories from the built-in list plus loaded module commands
and paginates eight commands per category. Its `help:` buttons and category
select are stateless: the requester's ID is encoded in the custom ID and checked
on every click. `/ping` and `/about` share `collectPingStats()`; `/ping` exposes
per-subsystem detail buttons under the `ping:` prefix.

## Definition

```ts
export const ping: CommandDef = {
  name: "ping",
  description: "Check bot latency.",
  module: null,
  prefix: true,
  build: () => new SlashCommandBuilder().setName("ping").setDescription("Check bot latency."),
  async run(ctx) {
    return ctx.replyInfo("Pong", "Gateway is alive.");
  },
};
```

- `build` is optional; dispatch creates a basic slash command if omitted.
- `guildOnly`, `ownerOnly`, `guildOwnerOnly`, `requiredPermissions`,
  `cooldownMs` are enforced in `apps/bot/src/runtime/dispatch.ts`.
- `prefix` opts into prefix commands. Prefix parsing uses the guild prefix or the
  runtime default. Positional arguments map to the builder's option order, so
  `,modules disable afk guild` fills `action`, `name`, `scope`.
- For subcommand commands, the first token is the subcommand and the remaining
  tokens map to that subcommand's options: `,notes add @user spam` maps to
  `user` and `note`. Subcommand groups consume both the group and subcommand
  tokens before options.

## Dispatch order

1. Resolve command (slash name or first prefix token).
2. Built-in? Skip module gate. Otherwise require a loaded, enabled module.
3. `guildOnly`, `ownerOnly`, `guildOwnerOnly`, `requiredPermissions`.
4. Permit check (`permitNode`) through `evaluatePermit`.
5. Module gate for module commands.
6. Cooldown (`SET NX PX` in Redis).
7. Build `CommandContext`, run, catch and reply with an error card.

`ownerOnly` accepts `OWNER_IDS` plus application/team owners, matching the permit
engine's bot-owner tier. Do not put authorization in a command body. Use the
flags or the context.

## Context

`CommandContext` (`packages/module-kit/src/context.ts`):

- `reply`, `replySuccess`, `replyError`, `replyInfo`
- `getString`, `getInteger`, `getBoolean`
- `defer`
- `guild`, `channel`, `member`, `user`, `guildId`, `services`

The implementation is `apps/bot/src/runtime/context.ts` and handles both interactions and
messages.
