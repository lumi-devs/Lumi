# Commands and dispatch

Commands come from two sources:

- Built-ins: `pingCommand` and `aboutCommand` in `src/core/`, and
  the `moduleCommands` registry (`/lumi`, `/permit`) in
  `src/admin/commands/index.ts`.
- Module commands: the `commands` array returned by `defineModule` in each module.

Slash and prefix commands share the same definitions. The default prefix is `,`
and each guild can override it in `/lumi` → Settings. Mentioning the bot also
works as a prefix. Administrative actions still live inside panels rather than
one command per action; `/permit` exists for scripted create/explain flows.

## Built-in vs module

- Built-in command: `module: null`. Always registered, always runnable, cannot be
  disabled or removed.
- Module command: `module: "<name>"`. Registered while the module is loaded and
  gated per guild at dispatch time.

`/ping` renders a Components V2 card with shard pagination (`◀️` / `▶️`),
per-shard latency and uptime, CPU/RAM, guild and member counts, cache hit ratio,
and live database latency.

`/about` describes the bot, links the source, and shows live instance statistics
and core architecture versions. It is available as both `/about` and `,about`.

`/lumi` opens the guild control hub with Overview, Modules, Settings,
Permissions, and Add-ons tabs. It replies ephemerally and has no close button.
Its `lumi:` components are routed through `HubPanel.handleInteraction`, which
also hosts the module detail/settings views and the Add-ons views. Permit actions
use the `permit_` panel routed in the same dispatcher. `/lumi` requires **Manage
Server** or an `admin.*`/`*` permit for slash and prefix use. The slash command is
visible to everyone so permit holders without Discord administrative roles can
open it.

`/permit create` and `/permit explain` provide direct permit workflows without
opening the hub. Create accepts a comma-separated node list and stores all nodes
on one permit; its node option autocompletes from built-in, module, and existing
custom nodes. `/permit explain` checks every node when its node option is
omitted. `/permit` requires **Manage Server** or an `admin.*`/`*` permit.

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

Interaction dispatch is in `src/core/dispatch.ts`:

1. Look up the slash command.
2. Reject unknown commands with an ephemeral error card.
3. For module commands, check `moduleLoader.isActive(guildId, module)` (the
   module and its supermodule must both be enabled).
4. For `requiresAdmin` commands, check **Manage Server** or an `admin.*`/`*`
   permit.
5. Run `execute`, then record command metrics.
6. On failure, reply with an ephemeral error card.

Prefix dispatch runs from `messageCreate`. It resolves the guild prefix (or a
bot mention), looks up the same command registry, checks the module switch,
`requiresAdmin`, and the command's `default_member_permissions`, then builds a
synthetic chat-input interaction for the existing command body. This keeps one
implementation per command. Prefix option parsing supports `--name value` and
positional values for the subcommand's options.

Module `interactionCreate` listeners are normal Discord listeners attached by the
loader; they run independently of the dispatcher. Within `handleComponent` the
order is: built-in `ping:` handlers, the `lumi:` hub (modules, settings,
permissions, and add-ons views), then the `permit_` panel. Each handler ignores
custom IDs it does not own.

## Module services

`services` is assembled in `src/index.ts` and passed to every command and
listener. It includes `client`, `redis`, `db` (`{ prisma, permits }`), `prisma`,
`permits`, `moduleLoader`, `moduleManager`, `modules.isEnabled`, `scheduler`,
`addons`, `config`, `configService`, `rpc`, `ui`, `discord`, and
`observability` (`{ healthMonitor, logger }`).
