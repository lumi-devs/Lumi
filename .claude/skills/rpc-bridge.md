# RPC Bridge (Redis Pub/Sub)

Bot ↔ Web Dashboard communication over Redis pub/sub.
No embedded HTTP server. Works across shards. Zero new ports.

---

## Architecture

```
Dashboard                       Bot (any shard)
    │                               │
    │  PUBLISH ember:rpc:in         │
    │─────────────────────────────▶ │
    │                               │ process request
    │                               │ SETEX ember:rpc:out:{id} 30 {response}
    │  GET ember:rpc:out:{id}       │
    │◀─────────────────────────────│
```

The bot uses a **dedicated subscriber connection** (Redis subscribed clients can only receive).
The main Redis client handles all write operations (SETEX for responses, etc.).

---

## Request Envelope

```typescript
interface RpcRequest {
  id: string;          // UUID — caller uses this to fetch the response
  action: RpcAction;   // e.g. 'guild.config.get'
  guildId?: string;    // required for guild-scoped actions
  actorId?: string;    // dashboard user ID (for audit log)
  data?: Record<string, unknown>;
}
```

## Response Envelope

```typescript
interface RpcResponse {
  id: string;
  ok: boolean;
  data?: unknown;      // populated on success
  error?: string;      // populated on failure
}
```

---

## Available Actions

### Read (any authenticated dashboard user)
| Action | Required fields | Returns |
|---|---|---|
| `bot.stats.get` | — | uptime, guild count, shard health |
| `bot.guilds.list` | — | list of guilds bot is in |
| `guild.config.get` | guildId | all module configs for a guild |
| `guild.modules.list` | guildId | which modules are enabled |
| `guild.permissions.list` | guildId | all permission overrides |
| `guild.modcases.list` | guildId, data.page? | paginated mod cases |

### Write — Guild Owner scope (requires guild owner or admin auth)
| Action | Required fields |
|---|---|
| `guild.config.set` | guildId, data.module, data.key, data.value |
| `guild.module.enable` | guildId, data.module |
| `guild.module.disable` | guildId, data.module |
| `guild.permissions.set` | guildId, data.commandPath, data.modelType, data.modelId, data.allow |
| `guild.permissions.clear` | guildId, data.commandPath? |
| `guild.ignore.add` | guildId, data.channelId? |
| `guild.ignore.remove` | guildId, data.channelId? |
| `guild.blocklist.add` | guildId, data.userId, data.reason? |
| `guild.blocklist.remove` | guildId, data.userId |

### Write — Bot Owner scope
| Action | Required fields |
|---|---|
| `global.config.set` | data.key, data.value |
| `global.blocklist.add` | data.userId, data.reason? |
| `global.maintenance.set` | data.enabled, data.message? |

---

## Registering a Handler

```typescript
// In your module's lib/rpc.ts
import { registerRpcHandler } from '#redis/rpc.js';

registerRpcHandler('guild.config.get', async (req) => {
  // validate req.guildId, fetch from DB, return data
  return { birthday: await getBirthdayConfig(req.guildId!) };
});
```

Handlers are registered at startup via `registerXxxRpcHandlers()` called from module setup.

---

## Audit Trail

Every RPC request is logged to `rpc_event_log` in Postgres:
- who called it (`actorId`)
- what they did (`action`)
- which guild (`guildId`)
- what payload (`data`)
- success/failure

This gives the dashboard a full audit log without the bot needing to implement separate logging.

---

## Rules

- **Dedicated subscriber connection** — `redis.duplicate()` for the subscriber
- **All response keys have TTL 30s** — stale responses self-clean
- **Handler errors are caught** — never crash the bridge; return `{ ok: false, error }`
- **Guild-scoped write actions must verify guild ownership** in the handler before mutating
- **Bot owner actions must verify actorId** is in `OWNER_IDS`
- **Every action is logged** to `rpc_event_log` (done automatically by `RpcBridge._dispatch`)
