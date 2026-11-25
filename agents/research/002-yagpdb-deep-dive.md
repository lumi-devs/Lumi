# YAGPDB Deep Architectural Analysis

**Repository**: `/home/rebiz/opt/workdir/.lumi-agents/research/repos/yagpdb`
**Date**: 2026-11-14

---

## Executive Summary

YAGPDB (Yet Another General Purpose Discord Bot) is a mature, production-grade Go Discord bot with a sophisticated multi-process architecture. It employs a **plugin-based modular design** with clear separation between:
- **Bot workers** (shard managers handling Discord events)
- **Web frontend** (control panel/dashboard)
- **Background workers** (scheduled tasks, feed processing)
- **Orchestrator** (shard management in clustered mode)

Communication between processes uses **Redis as the central coordination layer** with pub/sub for real-time events, service discovery, and distributed caching.

---

## 1. Caching Architecture

### 1.1 Multi-Layer Cache Hierarchy

YAGPDB implements a **three-tier caching system**:

| Layer | Technology | Purpose | TTL | Invalidation |
|-------|------------|---------|-----|--------------|
| **L1 (In-Memory)** | `github.com/karlseguin/ccache` | Hot data, feature flags, guild configs | 1 min (configurable) | Pub/sub eviction |
| **L2 (Redis)** | `radix/v3` pool + raw Redis commands | Shared cache, rate limits, sessions | Variable (key-specific) | Explicit TTL + pub/sub |
| **L3 (Structured Cache)** | `common/cacheset` (custom) | Complex objects with fetchers | 1 hour default | Pub/sub (`evict_cache_set`) + GC loop |

### 1.2 Core Cache Implementation (`common/cache.go`)

```go
var (
    ErrNotFound    = errors.New("Not found")
    CacheKeyPrefix = "cache_"
    Cache *ccache.Cache  // L1 in-memory cache
)

// Basic Redis-backed cache with 1-min default TTL
func GetCacheData(key string) (data []byte, err error)
func SetCacheData(key string, expire int, data []byte) error
func SetCacheDataJson(key string, expire int, data any) error
func GetCacheDataJson(key string, dest any) error
```

**Key characteristics**:
- **L1 cache (`ccache`)**: TODO comment notes "Also use a local application cache to save redis roundtrips" — currently only used for feature flags
- **Redis keys prefixed** with `cache_`
- **JSON helpers** for typed serialization
- **No automatic L1↔L2 sync** — L1 is per-process, Redis is shared

### 1.3 Structured CacheSet (`common/cacheset/cacheset.go`)

The **most sophisticated cache layer** — a generic, type-safe cache manager with:

```go
type Manager struct {
    slots   []*Slot
    TTL     time.Duration  // Default: 1 hour
    started bool
}

type Slot struct {
    name    string
    fetcher FetcherFunc    // func(key) (value, error)
    values  map[any]*cachedEntry
    fetching map[any]*sync.Cond  // Coalesces concurrent fetches
    keyType reflect.Type
}
```

**Features**:
- **Single-flight fetching**: `sync.Cond` prevents thundering herd
- **Per-slot TTL** (manager-wide default 1 hour)
- **Background GC loop** runs every minute, cycling through slots
- **Pub/sub invalidation**: `EvictCacheSet(slot, key)` publishes to `evict_cache_set` channel
- **Prometheus metrics**: `cache_hits_total`, `cache_misses_total`

**Usage pattern** (from `mqueue/bot.go`):
```go
var webhookCache = common.CacheSet.RegisterSlot("mqueue_webhook", nil, int64(0))
```

### 1.4 Feature Flags Cache (`common/featureflags/featureflags.go`)

Specialized **sharded in-memory cache** for guild feature flags:

```go
type flagCache struct {
    cache map[int64][]string
    l     sync.RWMutex
}

// 10 shards by guildID >> 22 % 10
var caches = initCaches()  // 10 flagCache instances
```

**Invalidation via dual pub/sub events**:
```go
const evictCachePubSubEvent = "feature_flags_updated"
const evictCachePubSubEvent2 = "feature_flags_updated_2"

func UpdateGuildFlags(guildID int64) error {
    defer pubsub.Publish(evictCachePubSubEvent, guildID, nil)
    defer pubsub.Publish(evictCachePubSubEvent2, -1, EvictCacheData{GuildID: guildID})
    // ... update Redis SMEMBERS ...
}
```

- **Event 1**: Targeted to specific guild's shard (`target = guildID`)
- **Event 2**: Broadcast to all nodes (`target = -1`) with structured data

### 1.5 Cache Invalidation Bus (Pub/Sub)

**Central Redis pub/sub channel**: `"events"`

**Message format**: `target,eventName,jsonData`
- `target`: guildID (int64), `-1` = all nodes, `0` = shard 0
- `eventName`: string identifier
- `jsonData`: optional payload

**Built-in cache invalidation events** (`common/pubsub/buildin_events.go`):
| Event | Target | Purpose |
|-------|--------|---------|
| `evict_core_config_cache` | guildID | Evict `CoreServerConfigCache` entry |
| `evict_cache_set` | -1 (all) | Evict specific `CacheSet` slot entry |
| `feature_flags_updated` | guildID | Invalidate feature flag cache shard |
| `feature_flags_updated_2` | -1 | Broadcast structured eviction |
| `global_ratelimit` | -1 | Pause all Discord requests on host |

**Subscription loop** (`common/pubsub/pubsub.go:104-145`):
- Uses `radix.PersistentPubSub` for auto-reconnect
- 100-message channel buffer
- Filter function `FilterFunc(guildID) bool` for shard-aware routing
- Handlers registered at startup via `AddHandler(evt, cb, type)`

---

## 2. Plugin/Module System

### 2.1 Plugin Interface (`common/plugins.go`)

```go
type PluginInfo struct {
    Name     string
    SysName  string      // snake_case, unique
    Category *PluginCategory
}

type Plugin interface {
    PluginInfo() *PluginInfo
}

var Plugins []Plugin

func RegisterPlugin(plugin Plugin)
func PluginLoaded(sysName string) bool
```

**Plugin Categories** (ordered):
1. `PluginCategoryCore` (Order: 0)
2. `PluginCategoryModeration` (Order: 10)
3. `PluginCategoryMisc` (Order: 20)
4. `PluginCategoryFeeds` (Order: 30)

### 2.2 Lifecycle Hooks (`bot/plugin.go`)

Plugins implement optional interfaces for lifecycle events:

```go
// Startup (bot process only)
type BotInitHandler interface { BotInit() }
type LateBotInitHandler interface { LateBotInit() }

// Shutdown
type BotStopperHandler interface { StopBot(wg *sync.WaitGroup) }

// Guild lifecycle
type NewGuildHandler interface { NewGuild(guild *discordgo.Guild) error }
type RemoveGuildHandler interface { RemoveGuild(guildID int64) error }

// Shard migration (clustered mode)
type ShardMigrationHandler interface { GuildMigrated(guild *dstate.GuildSet, toThisSlave bool) }
```

**Execution order** (`bot/bot.go:200-230`):
```go
// 1. BotInit - all plugins
for _, plugin := range common.Plugins {
    if initBot, ok := plugin.(BotInitHandler); ok {
        initBot.BotInit()
    }
}

// 2. LateBotInit - all plugins (after BotInit)
for _, plugin := range common.Plugins {
    if initBot, ok := plugin.(LateBotInitHandler); ok {
        initBot.LateBotInit()
    }
}

// 3. CommonRun - plugins with background workers (all processes)
common.RunCommonRunPlugins()

// Shutdown:
// 4. BotStopperHandler.StopBot(wg) - wait for all
```

### 2.3 Plugin Registration Pattern

Each plugin package provides a `RegisterPlugin()` function called at startup:

```go
// Example: common/mqueue/bot.go
func RegisterPlugin() {
    // ... init webhook session, DB schema ...
    p := &Plugin{}
    common.RegisterPlugin(p)
}

// Example: common/featureflags/featureflags.go (via init)
// Plugins self-register in init() or via explicit RegisterPlugin()
```

**Registration flow** (`cmd/yagpdb/main.go` → `bot.Run()` → `setup()`):
1. `common.CoreInit()` — Redis, DB, config
2. Plugin `RegisterPlugin()` calls (import-side effects)
3. `common.Init()` — starts `CacheSet.GCLoop`, Discord session
4. `botReady()` — triggers `BotInitHandler` → `LateBotInitHandler`
5. `common.RunCommonRunPlugins()` — starts background workers

### 2.4 Internal API Plugins (`common/internalapi/server.go`)

Special plugin type for **inter-process HTTP APIs**:

```go
type InternalAPIPlugin interface {
    InitInternalAPIRoutes(mux *goji.Mux)
}

// Registered plugins automatically get routes mounted
for _, p := range common.Plugins {
    if botRestPlugin, ok := p.(InternalAPIPlugin); ok {
        botRestPlugin.InitInternalAPIRoutes(muxer)
    }
}
```

**Used by**: `botrest` (bot state queries), `admin` (shard management)

---

## 3. Database & ORM Patterns

### 3.1 SQLBoiler (Primary ORM)

**Configuration** (per-plugin `sqlboiler.toml`):
```toml
# Example: bot/schema.go
//go:generate sqlboiler --no-hooks psql
```

**Models** generated in `*/models/` directories:
- `boil_queries.go`, `boil_table_names.go`, `boil_types.go`
- `boil_view_names.go`, `psql_upsert.go`
- Table-specific: `youtube_announcements.go`, `ticket_configs.go`, etc.

**Usage pattern**:
```go
// Direct model queries
models.JoinedGuilds(qm.Where("id = ?", guildID)).UpdateAll(ctx, common.PQ, models.M{
    "left_at": null.TimeFrom(time.Now()),
})
```

### 3.2 Redis (radix/v3)

**Pool configuration** (`common/common.go:229-265`):
```go
opts := []radix.PoolOpt{
    radix.PoolOnEmptyWait(),      // Block when pool exhausted
    radix.PoolOnFullClose(),      // Close idle conns when full
    radix.PoolPipelineWindow(0, 0), // No auto-pipelining
}
RedisPool, err = radix.NewPool("tcp", RedisAddr, maxConns, opts...)
```

**Patterns**:
- **Direct commands**: `RedisPool.Do(radix.Cmd(&result, "GET", key))`
- **Pipelines**: `RedisPool.Do(radix.Pipeline(actions...))`
- **Pub/sub**: `radix.PersistentPubSub` for event bus
- **Sorted sets**: Service discovery (`ZADD`/`ZRANGE`/`ZREMRANGEBYSCORE`)

### 3.3 Database Connection

```go
// common/common.go:267-283
func connectDB(host, user, pass, dbName string, maxConns int) error {
    db, err := sql.Open("postgres", dsn)
    PQ = db
    SQLX = sqlx.NewDb(PQ, "postgres")
    boil.SetDB(PQ)
    PQ.SetMaxOpenConns(maxConns)
}
```

---

## 4. Web Dashboard ↔ Bot IPC/RPC

### 4.1 Architecture Overview

```
┌─────────────────┐     HTTP/JSON      ┌──────────────────┐
│  Web Frontend   │ ◄─────────────────► │  Bot REST API    │
│  (web package)  │   internalapi      │  (botrest pkg)   │
└─────────────────┘   (localhost:5xxx)  └────────┬─────────┘
                                                 │
                    Redis Service Discovery       │
                    (yag_services sorted set)     │
                                                 ▼
                                        ┌──────────────────┐
                                        │  Bot Workers     │
                                        │  (shard processes)│
                                        └──────────────────┘
```

### 4.2 Service Discovery (`common/service.go`)

**ServiceTracker** (runs in each process):
- Registers itself in Redis sorted set `yag_services` (score = timestamp)
- Updates every 5 seconds with serialized `ServiceHost`:
  ```go
  type ServiceHost struct {
      InternalAPIAddress string  // e.g., "127.0.0.1:5123"
      Host               string  // hostname
      PID                int
      Version            string
      Services           []*Service
  }
  type Service struct {
      Type        ServiceType  // bot, frontend, bgworker, etc.
      Name        string
      Details     string
      BotDetails  *BotServiceDetails  // shards, nodeID, orchestrator mode
  }
  ```
- TTL: 30 seconds (auto-expires dead processes)

**ServicePoller** (client-side):
- Caches service list for 5 seconds
- `GetGuildAddress(guildID)` — finds bot worker owning guild's shard
- `GetShardAddress(shardID)` — direct shard lookup
- `GetNodeAddress(nodeID)` — specific process

### 4.3 Internal API Server (`common/internalapi/server.go`)

- **HTTP server** on random port in range `5100-5999` (configurable)
- **Bound to localhost** by default (`127.0.0.1`)
- **Auto-discovers port**, registers via `ServiceTracker.SetAPIAddress()`
- **Routes**: `/ping`, `/shutdown`, `/debug/pprof/*`, plus plugin routes
- **Plugin integration**: `InternalAPIPlugin.InitInternalAPIRoutes(mux)`

### 4.4 BotREST Client (`bot/botrest/client.go`)

Web frontend calls bot workers via **service discovery + HTTP**:

```go
func GetGuild(guildID int64) (g *dstate.GuildSet, err error) {
    // 1. Find which bot worker owns this guild's shard
    // 2. HTTP GET to that worker's internal API
    err = internalapi.GetWithGuild(guildID, "guildID/guild", &g)
    return
}

func GetMembers(guildID int64, members ...int64) ([]*discordgo.Member, error) {
    query := url.Values{"users": stringedIDs}
    err = internalapi.GetWithGuild(guildID, "guildID/members?"+query.Encode(), &m)
    return
}
```

**Client utilities** (`common/internalapi/clientutil.go`):
```go
func GetWithGuild(guildID int64, url string, dest any) error
func GetWithShard(shard int, url string, dest any) error
func GetWithAddress(addr string, url string, dest any) error
func PostWithGuild(guildID int64, url string, bodyData any, dest any) error
```

### 4.5 BotREST Server Endpoints (`bot/botrest/server.go`)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/:guild/guild` | Full `GuildSet` state |
| GET | `/:guild/botmember` | Bot's own member object |
| GET | `/:guild/members?users=` | Batch member fetch |
| GET | `/:guild/membercolors?users=` | Member color map |
| GET | `/:guild/onlinecount` | Online member count |
| GET | `/:guild/channelperms/:channel` | Permission calculation |
| GET | `/node_status` | Shard status, uptime |
| GET | `/shard_sessions` | Discord session info |
| POST | `/shard/:shard/reconnect` | Trigger shard reconnect |

**Clustered mode**: Routes to correct node via orchestrator (see `getNodeStatusesClustered()`)

### 4.6 Web Frontend Usage (`web/handlers_general.go`, `web/discorddata/discord_data.go`)

```go
// Web handler calls botrest
fullStatus, err := botrest.GetNodeStatuses()
perms, err := botrest.GetChannelPermissions(g.ID, channelID)
members, err := botrest.GetMembers(guildID, userID)

// DiscordData cache layer (web/discorddata/discord_data.go)
func fetchCached(key string, ttl time.Duration, fetcher func() (any, error)) (any, error) {
    // Tries Redis cache first, falls back to botrest
}
```

---

## 5. Message Queue (mqueue) — Async Work Distribution

### 5.1 Architecture (`common/mqueue/`)

```
┌─────────────┐     Redis Pub/Sub      ┌──────────────────┐
│  Producers  │ ────── "pushwork" ───► │  MqueueServer    │
│ (plugins)   │                        │  (per shard)     │
└─────────────┘                        └────────┬─────────┘
                                                 │
                                    Discord webhook / API
                                                 │
                                    ┌────────────▼────────────┐
                                    │  Redis Sorted Set       │
                                    │  (persistent queue)     │
                                    └─────────────────────────┘
```

**Components**:
- **RedisBackend**: Storage interface using Redis sorted sets (score = timestamp)
- **MqueueServer**: Worker per process, processes items for local shards
- **RedisPushServer**: Subscribes to Redis pub/sub, pushes to `MqueueServer.PushWork`
- **DiscordProcessor**: Executes sends via webhook session

### 5.2 Flow

1. **Producer** calls `QueueMessage(elem)` → writes to Redis sorted set + publishes "pushwork"
2. **RedisPushServer** receives pub/sub → sends `workItem` to `MqueueServer.PushWork` channel
3. **MqueueServer** picks up work, checks `ReadyTracker.IsGuildShardReady()`
4. **DiscordProcessor** sends via webhook, handles retries/rate limits
5. **Completion**: Removes from Redis sorted set on success, re-queues on retry

---

## 6. Shard Orchestration (Clustered Mode)

### 6.1 dshardorchestrator (`lib/dshardorchestrator/`)

- **Leader election** via Redis
- **Shard assignment** to nodes
- **Migration handling** via `ShardMigrationHandler` plugin interface
- **Node registry** in `dshardorchestrator_nodes_z` sorted set

### 6.2 Integration with Service Discovery

- `ServiceTracker` reads orchestrator node list
- `ServicePoller.GetShardCount()` queries orchestrator
- `botrest.GetNodeStatuses()` detects clustered mode via `EXISTS dshardorchestrator_nodes_z`

---

## 7. Key Architectural Decisions & Trade-offs

| Decision | Rationale | Trade-off |
|----------|-----------|-----------|
| **Redis as single source of truth** | Simplifies horizontal scaling, single coordination point | Redis becomes critical infrastructure; latency on every cache miss |
| **Per-process in-memory caches (ccache, flagCache, cacheset)** | Avoids Redis roundtrips for hot data | Cache inconsistency window (mitigated by pub/sub invalidation) |
| **HTTP internal API (not gRPC)** | Simplicity, debuggability, Go standard library | Higher overhead vs binary protocol; no codegen |
| **Service discovery via Redis sorted sets** | No external dependency (Consul/etcd), leverages existing Redis | Polling-based (5s cache), not push-based |
| **Plugin interfaces (not DI container)** | Explicit, compile-time checked, zero magic | Manual wiring, boilerplate for each hook |
| **SQLBoiler (codegen ORM)** | Type-safe, fast, no reflection at runtime | Requires regeneration on schema changes |
| **radix/v3 for Redis** | Pooling, pub/sub, pipelines, maintained | Less common than go-redis; smaller community |

---

## 8. File Reference Map

### Caching
- `common/cache.go` — Basic Redis + ccache
- `common/cacheset/cacheset.go` — Structured cache with fetchers
- `common/featureflags/featureflags.go` — Sharded feature flag cache
- `common/pubsub/pubsub.go` — Pub/sub event bus
- `common/pubsub/buildin_events.go` — Cache invalidation events

### Plugin System
- `common/plugins.go` — Core plugin registry
- `bot/plugin.go` — Lifecycle interfaces
- `bot/bot.go:200-230` — Lifecycle execution
- `common/internalapi/server.go` — Internal API plugin type

### Service Discovery & IPC
- `common/service.go` — ServiceTracker + ServicePoller
- `common/internalapi/server.go` — HTTP server
- `common/internalapi/clientutil.go` — Client helpers
- `bot/botrest/server.go` — Bot REST endpoints
- `bot/botrest/client.go` — Web → bot client

### Database
- `common/common.go:267-283` — Postgres connection
- `*/sqlboiler.toml` — ORM config per plugin
- `*/models/` — Generated models

### Message Queue
- `common/mqueue/mqueue.go` — Core types
- `common/mqueue/bot.go` — Plugin integration
- `common/mqueue/worker.go` — MqueueServer
- `common/mqueue/redisbackend.go` — Redis storage + RedisPushServer

### State & Sharding
- `lib/dstate/interface.go` — StateTracker, GuildSet
- `bot/readytracker.go` — Shard readiness
- `lib/dshardorchestrator/` — Cluster orchestration

---

## 9. Recommendations for Lumi-v2

Based on YAGPDB patterns:

1. **Adopt CacheSet pattern** for structured in-memory caching with single-flight fetches and pub/sub invalidation
2. **Use Redis sorted sets** for service discovery with TTL-based expiry — simple, no extra deps
3. **Internal HTTP API** for web↔bot communication — debuggable, works across processes
4. **Plugin lifecycle hooks** (Init/LateInit/Stop) — explicit, testable
5. **Shard-aware pub/sub filtering** — route events only to relevant workers
6. **SQLBoiler or similar codegen ORM** — type safety without runtime reflection
7. **Dual pub/sub for cache invalidation** — targeted + broadcast for race-condition safety
8. **Background GC loops** for cache managers — predictable memory behavior

---

*Report generated from direct code inspection of YAGPDB v2 repository.*