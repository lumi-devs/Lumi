# `@lumi/event-bus`

<div align="center">
  <img src="https://img.shields.io/badge/Package-Event%20Bus-blue?style=for-the-badge" alt="Package">
  <img src="https://img.shields.io/badge/Transports-InProc%20%7C%20Streams%20%7C%20NATS-orange?style=for-the-badge" alt="Transports">
</div>

> Pluggable, high-performance event bus abstraction for decoupled event streaming between Gateway and Worker processes.

---

## 📦 Role & Overview

`@lumi/event-bus` handles raw Discord Gateway dispatch transport between `apps/gateway` and `apps/worker`. It hides transport-specific details behind a unified interface (`EventBus`), allowing seamless switching between in-memory execution and distributed streaming backends.

---

## 🔌 Transports Supported

1. **`inproc`**: In-memory `EventEmitter` implementation for `monolith` role and local unit tests.
2. **`streams`**: Redis Streams implementation using `ioredis` with consumer group support (`XREADGROUP`, `XACK`, claim/dead-letter processing).
3. **`nats`**: NATS JetStream implementation using `nats` for multi-region or low-latency event distribution.

> **Note**: RabbitMQ is **not** an `@lumi/event-bus` transport. RabbitMQ is managed separately in `@lumi/core` for RPC and event fanout.

---

## 🔑 Key Exported APIs

- **`createEventBus(opts)`**: Factory function creating an `OwnedEventBus` based on `opts.transport` or `process.env.TRANSPORT`.
- **Bus Implementations**: `InProcBus`, `RedisStreamsBus`, `NatsJetStreamBus`.
- **Publishers & Consumers**:
  - `RawGatewayPublisher`: Wraps `@discordjs/ws` dispatch events and publishes `RawGatewayEnvelope` objects to the bus.
  - `attachProxyPublisher()`: Attaches event forwarding listeners directly to `@discordjs/ws` manager instances.
  - `RawGatewayConsumer`: Consumes stream events on workers and patches Sapphire's internal WS client to run handlers without opening a Discord WS connection.

---

## ⚙️ Configuration & Options

| Variable / Option | Description | Default | Notes |
|---|---|---|---|
| `TRANSPORT` | Bus backend (`inproc`, `streams`, `nats`) | `inproc` | Required |
| `EVENT_STREAM_MAXLEN` | Max stream length for Redis Streams capping (`MAXLEN ~`) | `100000` | Stream capping |
| `REDIS_HOST` / `REDIS_PORT` | Redis connection parameters | `localhost:6379` | Required for `streams` |
| `NATS_URL` / `NATS_SERVERS` | NATS connection URI(s) | `nats://localhost:4222` | Required for `nats` |
| `NATS_USER` / `NATS_PASSWORD` | NATS authentication credentials | `""` | Optional auth |

---

## 💻 Usage Example

```typescript
import { createEventBus, RawGatewayPublisher } from "@lumi/event-bus";

const bus = createEventBus({ transport: "streams" });
await bus.connect();

const publisher = new RawGatewayPublisher(bus);
await publisher.publish(0, rawDiscordPayload);
```
