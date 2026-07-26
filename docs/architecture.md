# Architecture & System Topology

Lumi is organized as a unified Bun workspace monorepo separating entrypoint applications (`apps/`) from reusable core packages (`packages/`).

## System Topology

```mermaid
graph TD
    subgraph Discord Infrastructure
        DC[Discord Gateway / REST API]
    end

    subgraph Edge & Ingestion
        GW[apps/gateway<br/>LUMI_ROLE=gateway]
        PX[nirn-proxy<br/>Discord Rate-Limit Proxy]
    end

    subgraph Event Transport Backplane
        EB{packages/event-bus<br/>Redis Streams}
    end

    subgraph Processing Pool
        WK1[apps/worker 1<br/>LUMI_ROLE=worker]
        WK2[apps/worker N<br/>LUMI_ROLE=worker]
        SCH[apps/scheduler<br/>LUMI_ROLE=scheduler]
    end

    subgraph Management & Web RPC
        DB_APP[apps/dashboard<br/>Web Admin UI :8080]
        MQ[(RabbitMQ<br/>RPC & Events)]
    end

    subgraph Datastores & Cache
        PG[(PostgreSQL 17)]
        PGB[PgBouncer :6432]
        RD[(Redis 7<br/>Cache & BullMQ)]
    end

    DC <-->|WebSocket| GW
    GW -->|Publish Raw Dispatch| EB
    EB -->|Consume Events| WK1
    EB -->|Consume Events| WK2

    WK1 <-->|REST Requests| PX
    WK2 <-->|REST Requests| PX
    PX <-->|Proxied REST| DC

    SCH <-->|BullMQ Tasks| RD

    WK1 -->|Transaction Pool| PGB
    WK2 -->|Transaction Pool| PGB
    PGB --> PG
    WK1 <-->|State & Invalidation| RD
    WK2 <-->|State & Invalidation| RD

    DB_APP <-->|RPC Commands| MQ
    MQ <-->|RPC Handler| WK1
```

## Dashboard RPC Sequence

```mermaid
sequenceDiagram
    autonumber
    actor Admin as Server Administrator
    participant DB as apps/dashboard (HTTP :8080)
    participant RMQ as RabbitMQ (RPC Queue)
    participant WK as apps/worker (@lumi/core)
    participant PG as PostgreSQL (PgBouncer)
    participant RD as Redis (Cache)

    Admin->>DB: Update Guild Module Config (/dashboard)
    DB->>RMQ: Publish RPC Request (UpdateConfigPayload)
    RMQ->>WK: Deliver RPC Message to Worker
    WK->>PG: Persist GuildModuleConfig (Prisma)
    WK->>RD: Invalidate Guild Config Cache (InvalidationBus)
    WK-->>RMQ: Publish RPC Success Response
    RMQ-->>DB: Receive RPC Ack & Data
    DB-->>Admin: Render 200 OK Response
```

## Monorepo Structure

| Category | Package | Purpose |
| :--- | :--- | :--- |
| **Apps** | `apps/worker` | Main execution engine — commands, events, module logic |
| | `apps/gateway` | Discord WebSocket ingestion (`LUMI_ROLE=gateway`) |
| | `apps/scheduler` | Background task scheduler, BullMQ queues |
| | `apps/dashboard` | Web admin panel on `:8080`, Discord OAuth2 |
| **Packages** | `@lumi/core` | Core framework, modules, Prisma models, i18n |
| | `@lumi/event-bus` | Redis Streams event bus |
| | `@lumi/observability` | Pino logger, OpenTelemetry, Prometheus `:9090` |
| | `@lumi/sharding` | Discord cluster coordinator & shard planner |
| | `@lumi/contracts` | Shared TypeScript interfaces, event schemas |
| | `@lumi/sdk` | Developer SDK for external extensions |
