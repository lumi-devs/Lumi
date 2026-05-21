# Sapphire Framework Patterns

Sourced from: Dragonite (favware/dragonite), @sapphire/framework v5, @sapphire/discord.js-utilities.

---

## Piece Types

| Piece | Base Class | Directory | Purpose |
|---|---|---|---|
| Command | `Command` | `commands/` | Slash + prefix commands |
| Listener | `Listener` | `listeners/` | Gateway events |
| Precondition | `Precondition` | `preconditions/` | Guards that run before commands |
| InteractionHandler | `InteractionHandler` | `interaction-handlers/` | Button/select/modal responses |
| ScheduledTask | `ScheduledTask` | `scheduled-tasks/` | Recurring jobs via BullMQ/Redis |

Sapphire auto-discovers all pieces by scanning these directories recursively.

---

## Container Augmentation

Extend the container with shared services (db, redis, etc.):

```typescript
// src/lib/types/Augments.d.ts
declare module '@sapphire/pieces' {
  interface Container {
    db: EmberDatabase;
    redis: Redis;
    moduleRegistry: ModuleRegistry;
  }
}
```

Access anywhere: `this.container.db`, `this.container.redis`, `container.redis` (imported).

---

## Base Command Pattern (from Dragonite)

```typescript
// src/lib/extensions/EmberCommand.ts
import { Command } from '@sapphire/framework';

export abstract class EmberCommand extends Command {
  protected get db() { return this.container.db; }
  protected get redis() { return this.container.redis; }

  // Shorthand card replies — all ephemeral by default
  protected async replySuccess(interaction: Command.ChatInputCommandInteraction, title: string, body: string) {
    const reply = { ...makeSuccessCard(title, body), ephemeral: true };
    return interaction.replied || interaction.deferred
      ? interaction.followUp(reply)
      : interaction.reply(reply);
  }
  // Same for replyError, replyWarning, replyInfo
}
```

---

## Preconditions

```typescript
// src/preconditions/MinimumPermissionLevel.ts
import { Precondition } from '@sapphire/framework';

export class MinimumPermissionLevelPrecondition extends Precondition {
  public async chatInputRun(interaction, command) {
    const required = command.options.requiredPermissionLevel ?? PermissionLevel.USER;
    const actual = await resolvePermissionLevel(interaction, this.container);
    return actual >= required ? this.ok() : this.error({ message: 'Insufficient permissions.' });
  }
}

// Register on command:
export class MyCommand extends EmberCommand {
  public constructor(context, options) {
    super(context, {
      ...options,
      preconditions: ['GuildOnly', 'ModuleEnabled', ['MinimumPermissionLevel', PermissionLevel.MOD]],
    });
  }
}
```

---

## Scheduled Tasks (@sapphire/plugin-scheduled-tasks)

```typescript
// src/modules/birthday/scheduled/dailyAnnounce.ts
import { ScheduledTask } from '@sapphire/plugin-scheduled-tasks';

export class BirthdayAnnounceTask extends ScheduledTask {
  public constructor(context, options) {
    super(context, { ...options, name: 'birthdayAnnounce', pattern: '0 8 * * *' });
  }

  public async run() {
    // Runs every day at 08:00 UTC — stored in Redis/BullMQ, survives restarts
  }
}
```

Declare in `Augments.d.ts`:
```typescript
declare module '@sapphire/framework' {
  interface ScheduledTasks {
    birthdayAnnounce: never;
  }
}
```

---

## InteractionHandlers (buttons, selects, modals)

```typescript
// src/interaction-handlers/confirmDelete.ts
import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import type { ButtonInteraction } from 'discord.js';

export class ConfirmDeleteHandler extends InteractionHandler {
  public constructor(ctx, options) {
    super(ctx, { ...options, interactionHandlerType: InteractionHandlerTypes.Button });
  }

  // parse() filters — return null to skip, non-null data to handle
  public override parse(interaction: ButtonInteraction) {
    if (!interaction.customId.startsWith('confirm-delete:')) return this.none();
    const [, id] = interaction.customId.split(':');
    return this.some({ id });
  }

  public async run(interaction: ButtonInteraction, data: { id: string }) {
    // Handle the button press
    await interaction.update({ components: [] });
  }
}
```

---

## SapphireClient Setup

```typescript
// src/EmberClient.ts
import { SapphireClient, LogLevel } from '@sapphire/framework';
import { GatewayIntentBits, Partials } from 'discord.js';

export function createClient() {
  return new SapphireClient({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,   // PRIVILEGED
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.MessageContent, // PRIVILEGED — only if prefix commands needed
    ],
    partials: [Partials.Channel, Partials.GuildMember],
    logger: { level: process.env.NODE_ENV === 'production' ? LogLevel.Info : LogLevel.Debug },
    loadDefaultErrorListeners: false,
    tasks: { bull: { connection: parseRedisConnectionOption() } },
  });
}
```

---

## Env Utilities (@skyra/env-utilities)

```typescript
// src/lib/setup/env.ts
import { setup } from '@skyra/env-utilities';
setup(new URL('../../.env', import.meta.url));

// Declare types in Augments.d.ts:
declare module '@skyra/env-utilities' {
  interface Env {
    BOT_TOKEN: string;
    POSTGRES_URL: string;
    // ...
  }
}

// Usage:
import { envParseString, envParseInteger } from '@skyra/env-utilities';
const token = envParseString('BOT_TOKEN');
const port = envParseInteger('REDIS_PORT', 6379);
```

---

## Rules

- `container` is imported from `@sapphire/framework` — use it anywhere outside a Piece
- Inside a Piece, use `this.container`
- Never `new Discord.Client()` — always `new SapphireClient()`
- Always `loadDefaultErrorListeners: false` — handle errors yourself
- Precondition names must match the class `name` property exactly
- `@sapphire/plugin-logger/register` and `@sapphire/plugin-scheduled-tasks/register` must be imported before client creation
