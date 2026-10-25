# Commands and dispatch

Slash commands come from two sources:

- Built-ins: `pingCommand` in `apps/bot/src/core/src/commands.ts` and the
  `moduleCommands` registry (`/lumi`) in `apps/bot/src/admin/src/commands/index.ts`.
- Module commands: the `commands` array returned by `defineModule` in each module.

There is no prefix-command parser. Administrative actions live inside the `/lumi`
panel and module panels, not in one slash command per action.

## Built-in vs module

- Built-in command: `module: null`. Always registered, always runnable, cannot be
  disabled or removed.
- Module command: `module: "<name>"`. Registered while the module is loaded and
  gated per guild at dispatch time.

`/ping` renders a Components V2 card with shard pagination (`◀️` / `Close` / `▶️`),
per-shard latency and uptime, CPU/RAM, guild and member counts, cache hit ratio,
and live database latency.

`/lumi` opens the guild control hub with Overview, Modules, Settings, and
Permissions tabs. Its `lumi:` components are routed through
`HubPanel.handleInteraction`; the Modules tab also opens the advanced
`module_` panel and the Settings tab opens the `settings_` panel. Permit actions
use the `permit_` panel routed in the same dispatcher.

`/tempvc` opens the control panel for the caller's temporary voice channel. Staff
generator management and module defaults are reachable through the `panel`
option (`Admin generators`, `Module settings`).

## Definition

```ts
export const exampleCommand: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("example")
    .setDescription("Run an example action."),
  async execute(interaction, services) {
    await interaction.reply(
      makeInfoCard("Example", "This is a Components V2 card."),
    );
  },
};
```

Every user-facing reply must be a card from `@lumi/ui`. Do not use embeds,
`content`, or `ephemeral: true`; use `ephemeralCard(card)` instead.

## Dispatch order

Interaction dispatch is in `apps/bot/src/index.ts`:

1. Look up the slash command.
2. Reject unknown commands with an ephemeral error card.
3. For module commands, check `moduleLoader.isEnabled(guildId, module)`.
4. Run `execute`, then record command metrics.
5. On failure, reply with an ephemeral error card.

Component dispatch runs module `interactionCreate` listeners first, then the
built-in `ping:` handlers, the `lumi:` hub, the `module_` / `settings_` panels,
and finally the `permit_` panel. Each handler ignores custom IDs it does not own.

## Module services

`services` is assembled in `apps/bot/src/index.ts` and passed to every command and
listener. It includes `client`, `redis`, `cache`, `prisma`, `permits`,
`moduleLoader`, `moduleManager`, `modules.isEnabled`, `security`, `scheduler`,
`config`, `configService`, `rpc`, `ui`, `discord`, and `observability`.
