# ember-rabbitmq

RabbitMQ integration for Ember: event bus, AMQP RPC bridge, and DLX job queue.
Load this skill before adding new event publishers, job handlers, or RPC actions.

---

## Architecture

Three systems share one `amqp-connection-manager` channel. All setup (exchanges, queues, bindings) is declared once in `src/lib/rabbitmq/manager.ts` and injected as `container.rabbitmq`.

| File | Role |
|---|---|
| `src/lib/rabbitmq/manager.ts` | `RabbitMQManager` — connection, channel setup, `publish()`, `request()`, `close()` |
| `src/lib/rabbitmq/rpc-server.ts` | Bot-side consumer for `ember.rpc.requests` → routes via shared `dispatchRpc()` |
| `src/lib/rabbitmq/jobs.ts` | `enqueueJob()`, `registerJobHandler()`, `startJobWorker()` |
| `src/lib/rabbitmq/index.ts` | Re-exports all three |
| `src/listeners/events/` | Built-in event bus publishers (memberJoin, memberLeave, guildJoin) |

Enable by setting `RABBITMQ_URL=amqp://user:pass@host:5672`. Omit it → bot runs Redis-only, all `if (!container.rabbitmq) return;` guards make everything a no-op.

---

## Exchanges and queues

| Name | Type | Purpose |
|---|---|---|
| `ember.events` | fanout | Event bus — dashboard, analytics, loggers bind queues here |
| `ember.rpc.requests` | queue | Dashboard sends RPC requests here |
| `ember.jobs` | direct | Routes `active` routing key → active queue |
| `ember.jobs.active` | queue | Workers pull from here |
| `ember.jobs.delayed` | queue | No consumers — TTL expiry dead-letters to `ember.jobs.active` |

---

## Event Bus

### Publishing (in any Sapphire Listener)

```typescript
// Non-async run — fire-and-forget with void
public override run(member: GuildMember) {
  if (!this.container.rabbitmq) return;
  void this.container.rabbitmq.publish('MEMBER_BAN', {
    guildId: member.guild.id,
    userId: member.user.id,
    moderatorId: executor.id,
    reason,
  });
}
```

### Adding a new event publisher

1. Create `src/listeners/events/<eventName>.ts`
2. Use `Events.<SapphireEvent>` for the listener event
3. Guard with `if (!this.container.rabbitmq) return;`
4. Call `void this.container.rabbitmq.publish('EVENT_TYPE', payload)`
5. Keep `run()` sync — no `async`; `publish` is fire-and-forget

### Subscribing (external service)

From the dashboard or any service with an AMQP connection:
```typescript
// Bind a queue to the fanout exchange
await ch.assertQueue('my-service.events');
await ch.bindQueue('my-service.events', 'ember.events', '');
await ch.consume('my-service.events', (msg) => {
  const { event, guildId, ...rest } = JSON.parse(msg.content.toString());
  // handle event
});
```

---

## Job Queue

### Enqueuing

```typescript
import { enqueueJob } from '#lib/rabbitmq/index.js';

// Immediate
await enqueueJob('SEND_DM', { userId: '123', content: 'Hello!' });

// Delayed — number in milliseconds (DLX pattern, no cron)
await enqueueJob('UNMUTE', { userId: '123', guildId: '456' }, 10 * 60 * 1000);
```

### Registering handlers (in module `onLoad`)

```typescript
import { registerJobHandler } from '#lib/rabbitmq/index.js';

registerJobHandler('UNMUTE', async ({ userId, guildId }) => {
  const guild = container.client.guilds.cache.get(guildId as string);
  const member = await guild?.members.fetch(userId as string).catch(() => null);
  if (member) await member.timeout(null, 'Automated unmute');
});
```

### Type safety — declaration merging

```typescript
// In your module's index.ts or a sibling types file
declare module '#lib/rabbitmq/jobs.js' {
  interface EmberJobs {
    UNMUTE: { userId: string; guildId: string };
    SEND_DM: { userId: string; content: string };
  }
}
```

This gives you typed `enqueueJob()` and `registerJobHandler()` calls.

### Sharp edges

- **Never requeue on failure** — the worker calls `ch.nack(msg, false, false)` on error. Add a retry exchange if you need retry semantics.
- **`expiration` is a string** — RabbitMQ's TTL field is always a string of milliseconds.
- **Prefetch is 10** — worker processes up to 10 jobs concurrently. Adjust in `startJobWorker()` if jobs are CPU-heavy.
- **Delayed queue has no consumers** — this is correct by design. RabbitMQ routes expired messages to `ember.jobs.active` via the DLX binding.

---

## AMQP RPC Bridge

### Bot side (auto-wired)

`startAmqpRpcServer()` is called in `initRabbitMQ()`. All `registerRpcHandler()` calls in `src/redis/rpc.ts` are automatically available over AMQP via the shared `dispatchRpc()` function. No duplication.

### Adding new RPC actions

Same as always — add to `RpcAction` union and call `registerRpcHandler()` in `registerDefaultHandlers()`. Works over Redis pub/sub AND RabbitMQ AMQP simultaneously.

### Dashboard/external service side

```typescript
// Using container.rabbitmq.request() (bot calling itself — rare)
const data = await container.rabbitmq.request('guild.config.get', { guildId }, 5000);

// External service using its own RabbitMQ connection
await ch.sendToQueue('ember.rpc.requests',
  Buffer.from(JSON.stringify({ action: 'guild.modules.list', guildId })),
  { correlationId: uuid(), replyTo: 'amq.rabbitmq.reply-to' }
);
```

Request envelope: `{ id?, action: RpcAction, guildId?, actorId?, data? }`
Response envelope: `{ id, ok, data?, error? }`

---

## Docker

One command: `docker compose up`

Starts `ember-dev` (hot-reload) + `postgres` + `redis` + `rabbitmq`. The compose file injects `RABBITMQ_URL` automatically — no manual `.env` entry needed for local dev.

Production: `docker compose --profile production up`

Management UI: `http://localhost:15672` (login: `ember`/`ember` by default)

---

## Guards

Always guard `container.rabbitmq` in pieces — it may be `undefined` if `RABBITMQ_URL` is not set:

```typescript
if (!this.container.rabbitmq) return;
```

This is intentional — Redis-only deployments should not break.
