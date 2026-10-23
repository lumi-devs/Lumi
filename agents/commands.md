# Commands and dispatch

Built-ins live in `apps/bot/src/commands/` and are wired directly by
`apps/bot/src/app.ts`. Module commands live in the module directory and arrive
through the loader.

## Built-in vs module

- Built-in command: `module: null`. Always registered, always runnable, cannot be
  disabled or removed.
- Module command: `module: "<name>"`. Registered only while that module is
  loaded; gated per guild at dispatch time.

`/ping`, `/help`, `/modules`, and `/addons` are built-ins. Module management must
never depend on a module being enabled.

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
  `cooldownMs` are enforced in `apps/bot/src/dispatch.ts`.
- `prefix` opts into prefix commands. Prefix parsing uses the guild prefix or the
  runtime default. Positional arguments map to the builder's option order, so
  `,modules disable afk guild` fills `action`, `name`, `scope`.

## Dispatch order

1. Resolve command (slash name or first prefix token).
2. Built-in? Skip module gate. Otherwise require a loaded, enabled module.
3. `guildOnly`, `ownerOnly`, `requiredPermissions`.
4. Cooldown (`SET NX PX` in Redis).
5. Build `CommandContext`, run, catch and reply with an error card.

Do not put authorization in a command body. Use the flags or the context.

## Context

`CommandContext` (`packages/module-kit/src/context.ts`):

- `reply`, `replySuccess`, `replyError`, `replyInfo`
- `getString`, `getInteger`, `getBoolean`
- `defer`
- `guild`, `channel`, `member`, `user`, `guildId`, `services`

The implementation is `apps/bot/src/context.ts` and handles both interactions and
messages.
