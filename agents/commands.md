# Commands and dispatch

Commands come from two sources:

- Built-ins: `createPingCommand()`, `createAboutCommand()`, `createHelpCommand()`,
  the owner commands, and the `moduleCommands` registry (`/lumi`, `/config`,
  `/permit`) in `src/admin/commands/index.ts`.
- Module commands: the `commands` array returned by `defineModule` in each module.

Slash and prefix commands share the same definitions. The default prefix is `,`
and each guild can override it in `/lumi` → Settings. Mentioning the bot also
works as a prefix. Set `prefixOnly: true` on a command definition to keep it
usable from the prefix dispatcher while excluding it from slash registration and
the slash command sync payload. Administrative actions live inside panels rather
than one command per action; `/permit` exists for scripted create/explain flows.

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

`/config module:<module>` opens a module's settings panel ephemerally from any
server. The module option autocompletes loaded modules. It requires
**Manage Server** or an `admin.*`/`*` permit. Use it for modules whose settings
have no prefix command (for example `mod` locks), and for the full
autorole, voice-role, and role-menu management panels.

`/tempvc` opens the control panel for the caller's temporary voice channel. Staff
generator management and module defaults are reachable through the `panel`
option (`Admin generators`, `Module settings`). Generator channels can also be
added, renamed, limited, and removed from `/lumi` → Modules → Temporary Voice →
Generators.

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
   module's own effective enabled state).
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

## Service bags

`CommandDefinition<S = ModuleServices>` is generic over the bag its `execute` and
`autocomplete` receive. Module commands use `ModuleServices`; built-in commands
use `BuiltinCommandDefinition = CommandDefinition<BotServices>` from
`src/core/modules.ts`. `CommandRegistry` stores a discriminated union on
`module`, and dispatch/prefix choose the bag after narrowing on
`command.module === null`.

- Module commands receive `client`, `permits`, `config` (a `ModuleConfigAccess`),
  `moduleConfig`, `ui`, `scheduler`, `observability`, `modules`, `helpers`,
  `discord`, and an optional `moduleName`. They never receive `prisma`, `redis`,
  or the raw cache client; persistence goes through `services.helpers`.
- Built-in commands receive the wide `BotServices` assembled in `src/index.ts`
  (`client`, `redis`, `prisma`, `helpers`, `configService`, `permits`,
  `scheduler`, `moduleLoader`, `moduleManager`, `addons`, `moduleConfig`,
  `modules`, `ui`, `discord`, `observability`).

`servicesForModule()` in `src/core/modules.ts` is the only projection between the
two. Static built-ins that need process handles are factories closed over them,
e.g. `createAboutCommand({ client, prisma, redis })`. See
[services.md](./services.md) for the full contract.
