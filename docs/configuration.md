# Lumi Configuration & Environment Variable Reference

> Complete reference index of all environment variables, transport matrix specifications, and Shapeshift schema rules in Lumi-TS.

---

## ⚙️ Master Environment Variable Reference

All configuration variables are loaded at application startup. Required parameters must be defined in your `.env` file or environment.

| Variable | Description | Required / Default | Target Roles / Packages |
|---|---|---|---|
| `LUMI_ROLE` | Runtime role (`monolith`, `gateway`, `worker`, `scheduler`) | `monolith` | `@lumi/core`, apps |
| `NODE_ENV` | Application environment (`development`, `production`, `test`) | `development` | All |
| `BOT_TOKEN` | Discord Bot Token | ✅ **Required** | `gateway`, `worker`, `monolith` |
| `CLIENT_ID` | Discord Application Client ID | ✅ **Required** | All |
| `DATABASE_URL` | PostgreSQL connection string | ✅ **Required** | `worker`, `monolith` |
| `REDIS_HOST` | Redis server hostname | `localhost` | All |
| `REDIS_PORT` | Redis server port | `6379` | All |
| `REDIS_PASSWORD` | Redis authentication password | `""` | All |
| `REDIS_DB` | Redis database index | `0` | All |
| `TRANSPORT` | Event bus transport backend (`inproc`, `streams`, `nats`) | `inproc` (`streams` in gateway/worker) | `@lumi/event-bus`, `gateway`, `worker` |
| `EVENT_STREAM_MAXLEN` | Redis Streams capping limit (`MAXLEN ~`) | `100000` | `@lumi/event-bus` |
| `NATS_URL` / `NATS_SERVERS` | NATS JetStream connection URI(s) | `nats://localhost:4222` | `@lumi/event-bus` (if `TRANSPORT=nats`) |
| `NATS_USER` / `NATS_PASSWORD` | NATS JetStream authentication credentials | `""` | `@lumi/event-bus` |
| `RABBITMQ_URL` | RabbitMQ connection URI for RPC and event fanout | `amqp://guest:guest@localhost:5672` | `@lumi/core`, `dashboard`, `worker` |
| `INTERACTION_DEFER_AT_GATEWAY` | Pre-acknowledge slash commands at Gateway before stream publishing | `false` | `apps/gateway` |
| `CLUSTER_NAME` | Name of Gateway cluster for multi-replica coordination | `null` (standalone) | `@lumi/sharding`, `apps/gateway` |
| `LUMI_CONSUMER_ID` / `HOSTNAME` | Unique node identifier for consumer groups | Process Hostname | `gateway`, `worker` |
| `DISCORD_OAUTH2_CLIENT_ID` | Discord OAuth2 Client ID for Dashboard login | Required for Dashboard | `apps/dashboard` |
| `DISCORD_OAUTH2_CLIENT_SECRET` | Discord OAuth2 Client Secret | Required for Dashboard | `apps/dashboard` |
| `DISCORD_OAUTH2_REDIRECT_URI` | Registered OAuth2 redirect URI | Required for Dashboard | `apps/dashboard` |
| `DASHBOARD_SESSION_SECRET` | HMAC key for signed cookies | Required for Dashboard | `apps/dashboard` |
| `DASHBOARD_HOST` | Dashboard HTTP listen host | `0.0.0.0` | `apps/dashboard` |
| `DASHBOARD_PORT` | Dashboard HTTP listen port | `8080` | `apps/dashboard` |
| `DASHBOARD_SECURE_COOKIES` | Enforce HTTPS secure cookies | `false` | `apps/dashboard` |
| `OTEL_ENABLED` | Enable OpenTelemetry tracing export | `"false"` | `@lumi/observability` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OpenTelemetry OTLP collector endpoint | `http://localhost:4318` | `@lumi/observability` |
| `OTEL_TRACES_SAMPLE_RATIO` | Trace sampling ratio (0.0 - 1.0) | `1.0` | `@lumi/observability` |
| `METRICS_PORT` | Prometheus metrics HTTP port (`/metrics`) | `9090` | `@lumi/observability`, All |
| `LOG_LEVEL` | Pino logger minimum level (`debug`, `info`, `warn`, `error`) | `info` | `@lumi/observability` |

---

## 📡 Messaging & Event Bus Transport Matrix

Lumi separates streaming transports (`@lumi/event-bus`) from RPC transports (RabbitMQ):

| Transport | Backend Engine | Role Compatibility | Primary Purpose | Scalability |
|---|---|---|---|---|
| `inproc` | Node `EventEmitter` | `monolith` only | In-memory event dispatching for single process | Vertical only |
| `streams` | Redis Streams | `gateway`, `worker`, `scheduler` | Distributed Gateway event streaming with consumer groups | Horizontal (KEDA stream lag) |
| `nats` | NATS JetStream | `gateway`, `worker`, `scheduler` | High-throughput, multi-region event streaming | Horizontal (KEDA consumer lag) |
| *RabbitMQ* | RabbitMQ (`amqplib`) | `worker`, `dashboard`, `scheduler` | Web Dashboard RPC bridge & cross-service event fanout | High RPC concurrency |

> [!WARNING]
> **Transport Requirement for Gateway Role**:
> If `LUMI_ROLE=gateway` is launched with `TRANSPORT=inproc`, the process logs a fatal error and immediately exits. Gateway nodes MUST use `streams` or `nats`.

---

## 📐 Shapeshift Config Schema Rules

Lumi features a **Shapeshift-first** module configuration paradigm:

### 1. Schema Declaration
Module configurations are declared strictly using Sapphire's `@sapphire/shapeshift` validators (`s.*`) inside `@DefineModule`:

```typescript
import { s } from "@sapphire/shapeshift";

@DefineModule({
  name: "filter",
  description: "Message filter module",
  configSchema: {
    blockInvites: s.boolean.default(true),
    maxMentions: s.number.default(5),
    wordBlacklist: s.array(s.string).default([]),
  },
})
export default class FilterModule extends Module {}
```

### 2. Flat `ConfigField[]` Derivation
When `@lumi/dashboard` requests guild settings via RabbitMQ RPC (`guild.dashboard.get`), `ConfigService` automatically inspects the module's Shapeshift schema to generate flat field descriptors (type, default value, validation constraints) for rendering browser UI forms dynamically.

### 3. Reading Configuration Lists
To read array configuration fields safely, always use `ConfigService.getConfigList()`:

```typescript
const blacklist = await container.configService.getConfigList<string>(guildId, "filter", "wordBlacklist");
```

### 4. Cache Invalidation Hooks
Do NOT monkey-patch `ConfigService` or invoke `redis.del` directly when configuration changes occur. Register cache invalidation hooks with `container.configChangeHooks`:

```typescript
container.configChangeHooks.set("filter:wordBlacklist", async (guildId, newValue) => {
  container.logger.info(`Config hook updated filter:wordBlacklist for ${guildId}`);
  // Perform localized cache update or service reset
});
```
