# `@lumi/core`

<div align="center">
  <img src="https://img.shields.io/badge/Package-Core%20Framework-blue?style=for-the-badge" alt="Package">
  <img src="https://img.shields.io/badge/Framework-Sapphire%20v5-blue?style=for-the-badge" alt="Framework">
  <img src="https://img.shields.io/badge/Database-Prisma%20PostgreSQL-darkblue?style=for-the-badge" alt="Database">
</div>

> The foundational framework library powering Lumi-TS, containing the bot client, dynamic module store, database facade, RabbitMQ bridge, card UI system, and built-in feature modules.

---

## 📦 Role & Overview

`@lumi/core` provides the primary application framework for Lumi. It integrates Sapphire Framework v5, Discord.js v14, Prisma PostgreSQL, Redis, and RabbitMQ.

---

## 🔑 Key Exported APIs & Surfaces

- **`LumiClient`**: Main client class extending Sapphire's `SapphireClient`. Bootstraps container services (`container.db`, `container.redis`, `container.rabbit`, `container.moduleStore`) and manages role-based startup (`LUMI_ROLE`).
- **`PinoSapphireLogger`**: Sapphire `ILogger` implementation bridging Sapphire internal logs to Pino.
- **Module System**:
  - `@DefineModule`: Class decorator for registering feature modules.
  - `Module`: Base class for module metadata and options (`configSchema`).
  - `Service`: Base class for module singletons with access to `this.logger`, `this.db`, `this.redis`.
- **Commands & UI**:
  - `BaseCommand`, `BaseSubcommand`: Base command classes auto-wiring permission preconditions.
  - Interaction Helpers: `replySuccess`, `replyError`, `replyWarning`, `replyInfo`, `sendReply`.
  - Card System: `makeCard`, `makeSuccessCard`, `makeErrorCard`, `makeWarningCard`, `makeInfoCard`, `makeListCard`.
- **Permissions**: `PermissionLevel` enum (`USER = 0`, `MOD = 5`, `ADMIN = 7`, `GUILD_OWNER = 8`, `BOT_OWNER = 10`), `resolvePermissionLevel()`.
- **Database & Cache**:
  - `DatabaseService` (`container.db`): Facade over domain repositories. Direct `container.prisma` usage in modules is forbidden.
  - `RedisKeys`: Strongly-typed templates for Redis cache keys.
  - `InvalidationBus`: Pub/Sub cache invalidation mechanism.
- **Scheduled Tasks**:
  - `RelayTask<K>`: Base class for BullMQ tasks with `CatchUpMeta` grace period checks.

---

## ⚙️ Configuration & Environment Variables

| Variable | Description | Default | Notes |
|---|---|---|---|
| `LUMI_ROLE` | Runtime role (`monolith`, `gateway`, `worker`, `scheduler`) | `monolith` | Role mode |
| `BOT_TOKEN` | Discord Bot Token | ✅ **Required** | Token |
| `DATABASE_URL` | PostgreSQL connection URI | ✅ **Required** | Prisma DB |
| `REDIS_HOST` | Redis server hostname | `localhost` | Redis host |
| `REDIS_PORT` | Redis server port | `6379` | Redis port |
| `RABBITMQ_URL` | RabbitMQ connection URI | `amqp://guest:guest@localhost:5672` | RPC bridge |

---

## 💻 Usage Example

```typescript
import { BaseCommand, replySuccess, PermissionLevel } from "#lib/commands.js";

export class SampleCommand extends BaseCommand {
  public constructor(context: BaseCommand.Context, options: BaseCommand.Options) {
    super(context, {
      ...options,
      permissionLevel: PermissionLevel.USER,
    });
  }

  public override async chatInputRun(interaction: BaseCommand.ChatInputCommandInteraction) {
    return replySuccess(interaction, "Success", "Command executed successfully.");
  }
}
```
