# Lumi-TS Architecture Guide

> Technical specification of Lumi-TS microservices topology, event streaming, RPC communication flows, background job catch-up policies, and monorepo package structure.

---

## 🏛️ Microservices Topology Overview

Lumi-TS is architected as a hybrid monorepo capable of running in a unified single-process mode (`monolith`) or as a decoupled cluster of dedicated microservices.

```
                           ┌──────────────────────────┐
                           │   Discord Gateway WS     │
                           └─────────────┬────────────┘
                                         │
                                         ▼
                                ┌─────────────────┐
                                │  apps/gateway   │
                                └────────┬────────┘
                                         │ (@lumi/event-bus)
                                         │ Redis Streams / NATS JetStream
                                         ▼
                                ┌─────────────────┐
  ┌──────────────────┐  RPC     │   apps/worker   │ ◄── Task Fire Events
  │  apps/dashboard  ├─────────►│   (Stateless)   │ (lumi.scheduler.fire)
  └──────────────────┘ RabbitMQ └────────┬────────┘
                                         │
                                         ▼
                               ┌───────────────────┐
                               │ PostgreSQL / Redis│
                               └───────────────────┘
                                         ▲
                                         │ BullMQ Queue
                                ┌────────┴─────────┐
                                │  apps/scheduler  │
                                └──────────────────┘
```

### Runtime Roles (`LUMI_ROLE`)

| Role | WS Connection | Scheduled Tasks | Event Bus Transport | Description |
|---|---|---|---|---|
| `monolith` | ✅ | ✅ (BullMQ) | `inproc` | Single unified process for local dev and small-to-medium deployments. |
| `gateway` | ✅ | ❌ | `streams` / `nats` | Manages Discord WebSocket shards and streams dispatch envelopes. Zero command logic. |
| `worker` | ❌ | ❌ | `streams` / `nats` / `inproc` | Stateless event consumer executing command logic, module listeners, and RPC. |
| `scheduler` | ❌ | ✅ (BullMQ) | `streams` / `nats` / `inproc` | Owns background job queues, evaluates grace periods, and triggers execution events. |

---

## 🔄 Sequence Flow Diagrams

### 1. Gateway Event Dispatching via `@lumi/event-bus`

When a Discord Gateway event arrives (e.g. `MESSAGE_CREATE`, `INTERACTION_CREATE`), `apps/gateway` wraps the payload into a `RawGatewayEnvelope` and streams it over `@lumi/event-bus` to worker nodes.

```mermaid
sequenceDiagram
    autonumber
    participant Discord as Discord Gateway WS
    participant Gateway as apps/gateway
    participant Bus as @lumi/event-bus (Redis / NATS)
    participant Worker as apps/worker
    participant Sapphire as Sapphire Client Dispatcher
    participant Module as ModuleListener / Command

    Discord->>Gateway: Raw WebSocket Dispatch Packet
    Gateway->>Gateway: Wrap in RawGatewayEnvelope (shardId, payload, ts, traceHeaders)
    alt INTERACTION_DEFER_AT_GATEWAY == true
        Gateway->>Discord: Pre-acknowledge Interaction (3s SLA)
    end
    Gateway->>Bus: publish("lumi.gateway.raw", envelope)
    Bus->>Worker: Consume via RawGatewayConsumer (XREADGROUP / JetStream)
    Worker->>Sapphire: Patch & inject into internal WS client dispatcher
    Sapphire->>Module: Route to registered listener / BaseCommand
    Worker->>Bus: ACK Packet (XACK)
```

---

### 2. Dashboard RPC Workflow via RabbitMQ

The web dashboard (`apps/dashboard`) allows server administrators to configure modules without executing database queries directly. All reads and writes pass through worker nodes using RabbitMQ RPC over queues `lumi.rpc.requests` and temporary reply queues (`amq.rabbitmq.rabbitmq.reply-to`).

```mermaid
sequenceDiagram
    autonumber
    participant User as Web Browser (Admin)
    participant Dash as apps/dashboard
    participant RMQ as RabbitMQ Broker
    participant Worker as apps/worker (DashboardModule)
    participant DB as PostgreSQL / Redis

    User->>Dash: Submit Module Config / Toggle (`POST /api/guild/config`)
    Dash->>Dash: Formulate RpcRequest (action: `guild.config.set`, guildId, payload)
    Dash->>RMQ: publishToQueue("lumi.rpc.requests", request, replyTo)
    RMQ->>Worker: Consume RpcRequest
    Worker->>Worker: Route to DashboardModule RPC handler
    Worker->>DB: container.db updates guild configuration & invalidates cache
    Worker->>RMQ: publishToQueue(replyTo, RpcResponse<T>)
    RMQ->>Dash: Receive RpcResponse
    Dash->>User: Render updated UI state
```

---

### 3. BullMQ `RelayTask` Catch-Up Policy

Background jobs (such as unbanning a user when a tempban expires) are scheduled via BullMQ on `apps/scheduler`. Before delegating execution to workers, `RelayTask` evaluates a catch-up grace window (`CatchUpMeta`) to ensure overdue tasks are safely handled or dropped.

```mermaid
sequenceDiagram
    autonumber
    participant App as Monolith / Worker Node
    participant Scheduler as apps/scheduler (BullMQ)
    participant Relay as RelayTask Engine
    participant Bus as Event Bus / RabbitMQ
    participant Worker as apps/worker

    App->>Scheduler: scheduleTask("unban", delay, data)
    Note over Scheduler: Timer expires / Cron triggers
    Scheduler->>Relay: RelayTask.run(job)
    Relay->>Relay: Inspect CatchUpMeta (scheduledFor, catchUp flag)
    alt Now > scheduledFor + 60,000ms AND catchUp == false
        Relay->>Relay: Grace period expired — log & skip execution
    else Execution approved
        Relay->>Bus: Publish task fire event ("lumi.scheduler.fire:unban", payload)
        Bus->>Worker: Consume task fire payload
        Worker->>Worker: Execute unban action on Discord API & update DB
    end
```

---

## 📂 Subpackage Breakdown & Monorepo Structure

The repository is organized into thin deployable applications (`apps/*`) and modular packages (`packages/*`):

### Applications (`apps/`)

- **`apps/dashboard` (`@lumi/dashboard`)**:
  - Stateless browser-based web dashboard.
  - Implements Discord OAuth2 login and surfaces auto-generated module configuration forms.
  - Communicates exclusively via RabbitMQ RPC (`@lumi/contracts`).

- **`apps/gateway` (`@lumi/gateway`)**:
  - Lightweight entrypoint for Discord WebSocket connections.
  - Integrates `@discordjs/ws` and `@lumi/sharding` for cluster coordination.
  - Streams wrapped dispatch packets to `@lumi/event-bus`.

- **`apps/scheduler` (`@lumi/scheduler`)**:
  - Owns BullMQ queue and task runner (`@sapphire/plugin-scheduled-tasks`).
  - Evaluates `RelayTask` grace periods and broadcasts task fire events to workers.

- **`apps/worker` (`@lumi/worker`)**:
  - Stateless event, command, and RPC processing worker node.
  - Scales horizontally (1 to N instances) behind consumer groups.

### Packages (`packages/`)

- **`packages/contracts` (`@lumi/contracts`)**:
  - Shared wire contracts, RPC action constants (`RPC_ACTIONS`), stream topic names, and manifest interfaces. Zero runtime dependencies.

- **`packages/core` (`@lumi/core`)**:
  - Core framework library containing `LumiClient`, module store, `DatabaseService`, card utilities, base commands, permission handlers, and built-in modules (`packages/core/src/modules/`).

- **`packages/event-bus` (`@lumi/event-bus`)**:
  - Transport abstraction layer supporting `inproc` (EventEmitter), `streams` (Redis Streams), and `nats` (NATS JetStream).

- **`packages/observability` (`@lumi/observability`)**:
  - Observability primitives including OpenTelemetry tracing (`startTracing`), Pino logger (`createPinoLogger`), Prometheus metrics (`METRICS_PORT=9090`), and graceful drain sequences.

- **`packages/sdk` (`@lumi/sdk`)**:
  - Public developer SDK re-exporting framework decorators, base commands, cards, and formatting utilities for third-party addon creation.

- **`packages/sharding` (`@lumi/sharding`)**:
  - Redis-backed cluster coordinator (`ClusterCoordinator`), dynamic sharding strategy (`DynamicShardingStrategy`), session store, and identify rate throttler.
