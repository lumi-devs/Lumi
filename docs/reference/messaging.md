# Distributed Messaging & RPC

Ember employs a **Hybrid Messaging Architecture** to handle high-concurrency operations, distributed state, and inter-service communication. By combining **Redis** for low-latency caching and **RabbitMQ** for reliable message delivery, Ember achieves both performance and durability.

## Redis: Global State & Invalidation

Redis serves as the bot's primary high-speed data store. It is used for more than just simple caching; it acts as the "nerve center" for the cluster.

### Key Registry
Ember uses a strictly-typed `RedisKeys` registry in `src/database/redis.ts`. Hard-coding string keys in feature code is forbidden. This ensures that every part of the system uses the same namespace and key patterns, preventing collisions.

### Cluster-Wide Invalidation
When a setting is updated (e.g., via the dashboard), Ember uses a **Pub/Sub Invalidation Bus**.
1.  A service updates the database and the primary Redis key.
2.  An invalidation message is broadcast via the `ember:cache:invalidate` channel.
3.  Every bot instance in the cluster receives the message and immediately drops the corresponding key from its local memory cache (memos).

## RabbitMQ: The Event & RPC Bus

While Redis handles state, RabbitMQ handles **Intent**. It carries exactly two things: cross-process fanout events and the dashboard RPC bridge. There is no general-purpose fire-and-forget job queue — that was removed (nothing consumed it). Durable/time-based work runs on **BullMQ** scheduled tasks; CPU-bound work runs on **`WorkerManager`** threads.

### Topology Overview

| Exchange / Queue | Type | Description |
| :--- | :--- | :--- |
| `ember.events` | `fanout` | A broadcast bus for events like message metrics, log streams, and real-time dashboard updates. |
| `ember.rpc.requests` | `queue` | The entry point for dashboard-to-bot commands. Uses **Direct Reply-To** for near-instant responses. |

### RPC System (Direct Reply-To)
Ember implements a transport-agnostic RPC bridge managed by `src/core/rabbitmq/index.ts`. The dashboard sends a JSON payload to `ember.rpc.requests` with a `replyTo` property set to `amq.rabbitmq.reply-to`. The bot processes the request and sends the response directly back to the temporary virtual queue, allowing for high-performance, stateless communication between the web frontend and the Discord backend. Requests carrying a `guildId` are gated by `isDashboardEnabled`.

### Background work (not on RabbitMQ)
- **Time-based / durable jobs** → BullMQ (`@sapphire/plugin-scheduled-tasks`, Redis DB 1). Schedule with `container.tasks.create(...)`; survives restarts. Overdue-after-downtime behaviour is per-task via the `catchUp` policy in `src/core/lib/scheduled-tasks.ts`.
- **CPU-bound work** → `WorkerManager` worker threads, called directly by the feature (e.g. `FilterService`).
