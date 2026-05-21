# Ember Module System

An Ember module is a directory in `src/modules/{name}/` containing Sapphire Pieces
plus module-local infrastructure. Zero coupling to other modules.

---

## Module Directory Layout

```
src/modules/birthday/
  index.ts                  ← ModuleMeta export (required)
  commands/
    birthday.ts             ← ChatInputCommand: /birthday set|list|remove
  listeners/
    guildMemberAdd.ts       ← optional gateway events
  scheduled/
    dailyAnnounce.ts        ← ScheduledTask (BullMQ via Redis)
  interaction-handlers/
    confirmDelete.ts        ← button/select/modal responses
  lib/
    BirthdayService.ts      ← business logic (no discord.js imports in here)
    schema.ts               ← Drizzle table definitions
    redis.ts                ← Redis key helpers for this module
    rpc.ts                  ← RPC handler registrations
```

---

## Module Index (required)

```typescript
// src/modules/birthday/index.ts
import type { ModuleMeta } from '#lib/structures/ModuleRegistry.js';
import { FieldType } from '#lib/structures/ModuleRegistry.js';

export const meta: ModuleMeta = {
  name: 'birthday',              // must match directory name
  displayName: 'Birthday',
  emoji: '🎂',
  description: 'Announce member birthdays on a configured channel.',
  configFields: [
    {
      key: 'channelId',
      label: 'Announcement Channel',
      type: FieldType.CHANNEL,
      required: true,
      description: 'Where birthday announcements are posted',
    },
    {
      key: 'message',
      label: 'Birthday Message',
      type: FieldType.TEXT,
      default: '🎂 Happy birthday {user}!',
    },
    {
      key: 'enabled',
      label: 'Enabled',
      type: FieldType.BOOLEAN,
      default: true,
    },
  ],
  // Called by /mydata delete — required for GDPR
  async deleteUserData(db, userId: bigint): Promise<void> {
    await db.delete(birthdayEntries).where(eq(birthdayEntries.userId, userId));
  },
};
```

`ModuleRegistry.register(meta)` is called automatically when any Piece from this module loads.

---

## Command Structure

```typescript
// src/modules/birthday/commands/birthday.ts
import { EmberCommand } from '#lib/extensions/EmberCommand.js';
import { Command, ApplicationCommandRegistry } from '@sapphire/framework';
import { PermissionLevel } from '#core/permissions.js';

export class BirthdayCommand extends EmberCommand {
  public constructor(context: Command.LoaderContext, options: Command.Options) {
    super(context, {
      ...options,
      name: 'birthday',
      description: 'Manage your birthday',
      preconditions: ['GuildOnly', 'ModuleEnabled'],
    });
  }

  public override registerApplicationCommands(registry: ApplicationCommandRegistry) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName('birthday')
        .setDescription('Manage your birthday')
        .addSubcommand((sub) =>
          sub.setName('set').setDescription('Set your birthday').addStringOption((o) =>
            o.setName('date').setDescription('Your birthday (DD/MM)').setRequired(true),
          ),
        )
        .addSubcommand((sub) => sub.setName('remove').setDescription('Remove your birthday'))
        .addSubcommand((sub) => sub.setName('list').setDescription('See upcoming birthdays')),
    );
  }

  public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand(true);
    await interaction.deferReply({ ephemeral: true });
    if (sub === 'set') return this.#set(interaction);
    if (sub === 'remove') return this.#remove(interaction);
    if (sub === 'list') return this.#list(interaction);
  }

  async #set(interaction: Command.ChatInputCommandInteraction) { ... }
  async #remove(interaction: Command.ChatInputCommandInteraction) { ... }
  async #list(interaction: Command.ChatInputCommandInteraction) { ... }
}
```

---

## Redis Key Helpers (module-local)

```typescript
// src/modules/birthday/lib/redis.ts
import { RedisKeys } from '#redis/keys.js';

// Extend core key patterns with birthday-specific ones
export const BirthdayRedisKeys = {
  guildConfig: (guildId: string) => RedisKeys.guildConfig('birthday', guildId),
  pendingAnnounce: (guildId: string) => `ember:birthday:pending:${guildId}`,
} as const;
```

---

## Schema (module-local)

```typescript
// src/modules/birthday/lib/schema.ts
// See postgres-drizzle.md for full patterns

// IMPORTANT: Export must be added to src/db/schema/index.ts:
// export * from '../../modules/birthday/lib/schema.js';
```

---

## RPC Handler Registration (for dashboard)

```typescript
// src/modules/birthday/lib/rpc.ts
import { registerRpcHandler } from '#redis/rpc.js';
import { container } from '@sapphire/framework';
import { birthdayEntries, birthdayGuildConfig } from './schema.js';
import { eq } from 'drizzle-orm';

export function registerBirthdayRpcHandlers() {
  registerRpcHandler('guild.config.get', async (req) => {
    if (!req.guildId) throw new Error('guildId required');
    return container.db.query.birthdayGuildConfig.findFirst({
      where: (t, { eq }) => eq(t.guildId, BigInt(req.guildId!)),
    });
  });

  registerRpcHandler('guild.config.set', async (req) => {
    // validate + upsert
  });
}
```

Call `registerBirthdayRpcHandlers()` in the module's first Listener `onLoad()` or a dedicated setup listener.

---

## Module Isolation Rules

1. **No cross-module imports** — `birthday` must never `import from '../../afk/...'`
2. **No shared mutable state** — each module manages its own Postgres tables and Redis keys
3. **Config field keys must be unique per module** — namespace them if ambiguous
4. **ScheduledTasks must be declared in `Augments.d.ts`** so TypeScript knows about them
5. **All user data deletable** — implement `deleteUserData()` in `meta`
