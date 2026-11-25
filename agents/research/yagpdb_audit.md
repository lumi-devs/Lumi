# YAGPDB Deep Architectural Audit

**Repository**: `refs/yagpdb` (Go Discord bot)
**Date**: 2026-11-14

---

## Executive Summary

YAGPDB (Yet Another General Purpose Discord Bot) is a mature, production-grade Discord bot with a sophisticated multi-tier caching architecture, plugin system, sharding coordination via Redis, internal HTTP RPC for dashboard-bot sync, and Prometheus metrics instrumentation throughout hot paths. This audit documents concrete patterns with file paths and line numbers for Lumi v2 overhaul reference.

---

## 1. Three-Tier Cache Architecture

YAGPDB implements a **de facto three-tier cache** through multiple complementary mechanisms:

### Tier 1: L1 - In-Memory (ccache / rcache)
**Local per-process cache with TTL and size limits**

| File | Line | Pattern |
|------|------|---------|
| `common/coreserverconf.go` | 26 | `rcache.NewInt(fetcher, time.Minute)` — typed cache with 1-min TTL |
| `common/cacheset/cacheset.go` | 13-17, 112-116 | `Manager` with `Slot` containing `map[interface{}]*cachedEntry` with `expiresAt` and `accessCounter` |
| `automod/automod.go` | 38 | `ccache.New(ccache.Configure())` — unbounded regex cache |
| `moderation/plugin_bot.go` | 115 | `ccache.New(ccache.Configure().MaxSize(15000))` — bounded config cache |
| `notifications/plugin_bot.go` | 31 | `ccache.New(ccache.Configure().MaxSize(15000))` |
| `web/discorddata/discord_data.go` | 33 | `ccache.New(ccache.Configure().MaxSize(10000).ItemsToPrune(100))` |
| `bot/shardmemberfetcher/shardmemberfetcher.go` | 62 | `ccache.New(ccache.Configure())` — failed user cache |

**Eviction Policies**:
- **TTL-based**: `cacheset.Manager.RunGCLoop()` runs every minute, calls `Slot.gc()` which deletes expired entries (`cacheset.go:216-225`)
- **Size-based**: `ccache` with `MaxSize()` and `ItemsToPrune()` — LRU eviction when capacity exceeded
- **Manual invalidation**: `Slot.Delete(key)` and `Slot.DeleteFunc()` for targeted eviction (`cacheset.go:190-210`)

### Tier 2: L2 - Redis (Distributed Cache/Coordination)
**Shared across all nodes via Redis pub/sub and keys**

| File | Line | Pattern |
|------|------|---------|
| `common/cache.go` | 22-37 | `GetCacheData`/`SetCacheData` — raw Redis GET/SET with EX expiry |
| `common/pubsub/buildin_events.go` | 77-93 | `EvictCacheSet()` — publishes `evict_cache_set` event to invalidate L1 across all nodes |
| `common/pubsub/pubsub.go` | 68-81 | `Publish()` — Redis PUBLISH to `events` channel |
| `common/pubsub/buildin_events.go` | 62-74 | `handleEvictCacheSet()` — receives pubsub, deletes from local `CacheSet` |
| `common/config/redissource.go` | 14-40 | `RedisConfigStore` — reads config from Redis hash `yagpdb_config` |
| `bot/bot.go` | 278-301 | Gateway identify concurrency cached in Redis with 6hr TTL (`SETEX`) |

**Invalidation Flow**:
```
Config change → Redis HSET → Publish "evict_core_config_cache" 
    → All nodes receive → common.CoreServerConfigCache.Delete(guildID)
```

### Tier 3: L3 - Persistent (PostgreSQL)
**Source of truth via SQLBoiler ORM**

| File | Line | Pattern |
|------|------|---------|
| `common/coreserverconf.go` | 32-44 | `coreServerConfigCacheFetcher` — falls back to `models.FindCoreConfigG()` |
| `common/coreserverconf.go` | 56-64 | `CoreConfigSave()` — upserts to DB, then invalidates L1 via `CoreServerConfigCache.Delete()` |
| `bot/joinedguildsupdater/joinedguildsupdater.go` | 123-172 | Batched guild/member count updates flushed to DB periodically |

**Cache Population Flow**:
```
L1 miss → fetcher function → L2 Redis (config) or L3 PostgreSQL → populate L1 → return
```

### Tier Integration: `cacheset.Manager` (Common CacheSet)
**File**: `common/cacheset/cacheset.go`

```go
// Registration at init time only (panic if after start)
CacheSet = cacheset.NewManager(time.Hour)  // common.go:35
go CacheSet.RunGCLoop()                     // common.go:84

// Slot registration with custom fetcher
configCache = CacheSet.RegisterSlot("autorole_config", fetcher, int64(0))
```

**Key Features**:
- **Single-flight**: `sync.Cond` prevents duplicate fetches for same key (`cacheset.go:140-149`)
- **Metrics**: `yagpdb_cacheset_cache_hits_total` / `yagpdb_cacheset_cache_misses_total` (`cacheset.go:236-244`)
- **GC**: Round-robin slot cleanup every minute (`cacheset.go:25-46`)

---

## 2. Plugin Registration & Hot-Reload

### Plugin Interface (`bot/plugin.go:28-55`)
```go
type Plugin interface {
    PluginInfo() *common.PluginInfo
}

type BotInitHandler interface { BotInit() }
type LateBotInitHandler interface { LateBotInit() }
type BotStopperHandler interface { StopBot(wg *sync.WaitGroup) }
type ShardMigrationHandler interface { GuildMigrated(guild *dstate.GuildSet, toThisSlave bool) }
```

### Registration (`common/plugins.go:32-35`)
```go
var Plugins []Plugin

func RegisterPlugin(plugin Plugin) {
    Plugins = append(Plugins, plugin)
    logger.Info("Registered plugin: " + plugin.PluginInfo().Name)
}
```

### Initialization Sequence (`bot/bot.go:202-214`)
```go
// In botReady()
for _, plugin := range common.Plugins {
    if initBot, ok := plugin.(BotInitHandler); ok {
        initBot.BotInit()
    }
}
for _, plugin := range common.Plugins {
    if initBot, ok := plugin.(LateBotInitHandler); ok {
        initBot.LateBotInit()
    }
}
```

### CommonRun (Runs in Web + Bot) (`common/plugins.go:50-60`)
```go
type PluginWithCommonRun interface { CommonRun() }

func RunCommonRunPlugins() {
    for _, v := range Plugins {
        if cast, ok := v.(PluginWithCommonRun); ok {
            go cast.CommonRun()
        }
    }
}
```

### Plugin Examples
| Plugin | File | Interfaces Implemented |
|--------|------|------------------------|
| Bot Core | `bot/plugin.go` | Plugin, BotInitHandler, LateBotInitHandler, BotStopperHandler |
| Automod | `automod/automod.go` | Plugin, BotInitHandler, LateBotInitHandler |
| Internal API | `common/internalapi/server.go` | PluginWithCommonRun, InternalAPIPlugin |

### Hot-Reload Capability
**No true hot-reload** — plugins registered at startup via `init()` functions. Config changes trigger cache invalidation via pubsub (`evict_core_config_cache`, `evict_cache_set`) but **code changes require restart**.

---

## 3. Sharding / Cluster Coordination via Redis

### Shard Orchestrator (`lib/dshardorchestrator/`)
**External process managing shard distribution across nodes**

| File | Line | Responsibility |
|------|------|----------------|
| `orchestrator/orchestrator.go` | 45-97 | `Orchestrator` struct — node connections, shard assignments |
| `orchestrator/orchestrator.go` | 222-315 | `StartShardMigration()` — moves shard between nodes |
| `orchestrator/orchestrator.go` | 348-371 | `StartShards()` — starts shards on node |
| `orchestrator/orchestrator.go` | 373-393 | `StopShard()` — stops shard on any node |
| `orchestrator/orchestrator.go` | 395-441 | `MigrateFullNode()` — drains all shards from node |
| `orchestrator/monitor.go` | — | Health monitoring, node liveness |

### Node Registration (`cmd/shardorchestrator/main.go:103-122`)
```go
func UpdateRedisNodes(orch *orchestrator.Orchestrator) {
    t := time.NewTicker(time.Second * 10)
    for {
        // Write node status to Redis sorted set: dshardorchestrator_nodes_z
    }
}
```

### Bot Shard Manager (`bot/bot.go:363-397`)
```go
func setupShardManager() {
    ShardManager = dshardmanager.New(common.GetBotToken())
    ShardManager.GuildCountsFunc = GuildCountsFunc
    ShardManager.SessionFunc = func(token string) (*discordgo.Session, error) { ... }
    ShardManager.AddHandler(eventsystem.HandleEvent)
}
```

### Shard Migration Handling (`bot/plugin.go:53-55`)
```go
type ShardMigrationHandler interface {
    GuildMigrated(guild *dstate.GuildSet, toThisSlave bool)
}
```

### Service Discovery (`common/service.go`)
| Component | Purpose |
|-----------|---------|
| `ServiceTracker` | Registers services (bot, web) with details in Redis hash `yag_services` |
| `ServicePoller` | Reads Redis to find which node owns which shard |
| `GetGuildAddress(guildID)` | Returns internal API address of node handling guild |
| `GetShardAddress(shard)` | Returns internal API address of node handling shard |

**Coordination Flow**:
```
1. Orchestrator starts → listens for node connections
2. Bot nodes connect → register with orchestrator
3. Orchestrator assigns shards → tells nodes to StartShards()
4. Nodes register in Redis (yag_services) with internal API port
5. Web/dashboard queries ServicePoller → routes requests to correct node
6. Shard migration → orchestrator coordinates → nodes handle GuildMigrated()
```

---

## 4. Internal HTTP RPC for Dashboard-Bot Sync

### Internal API Server (`common/internalapi/server.go`)
**Runs on each bot node, exposes HTTP endpoints for web dashboard**

```go
func (p *Plugin) CommonRun() {
    muxer := goji.NewMux()
    muxer.HandleFunc(pat.Get("/ping"), handlePing)
    muxer.HandleFunc(pat.Post("/shutdown"), handleShutdown)
    // Debug pprof endpoints
    
    for _, p := range common.Plugins {
        if botRestPlugin, ok := p.(InternalAPIPlugin); ok {
            botRestPlugin.InitInternalAPIRoutes(muxer)
        }
    }
    p.run(muxer)  // Starts HTTP server on 127.0.0.1:port
}
```

### Client Utilities (`common/internalapi/clientutil.go`)
```go
func GetWithGuild(guildID int64, url string, dest interface{}) error
func GetWithShard(shard int, url string, dest interface{}) error
func PostWithGuild(guildID int64, url string, bodyData, dest interface{}) error
```

**Resolution**: `ServicePoller.GetGuildAddress(guildID)` → internal API address

### Plugin-Specific Endpoints (`InternalAPIPlugin` interface)
```go
type InternalAPIPlugin interface {
    InitInternalAPIRoutes(mux *goji.Mux)
}
```

**Example**: Admin panel proxies to internal API (`admin/web.go:123-147`)
```go
func (p *Plugin) ProxyGetInternalAPI(path string) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        addr := findServicehost(r)  // Get node address from ServicePoller
        // Proxy request to bot node's internal API
    })
}
```

### Authentication
**None** — bound to `127.0.0.1` by default (`server.go:95-99`), relies on network isolation.

---

## 5. Prometheus Metrics in Hot Paths

### Metric Types Used
| Type | Use Case | Example |
|------|----------|---------|
| `CounterVec` | Event counts by label | `yagpdb_pubsub_events_handled_total` (event) |
| `GaugeVec` | Current state by label | `bot_shards_status` (status: LOADING/READY/DISCONNECTED) |
| `Gauge` | Single value | `bot_guilds_total`, `bot_members_total` |
| `Counter` | Monotonic | `yagpdb_cacheset_cache_hits_total` |

### Hot Path Instrumentation

| File | Line | Metric | Path |
|------|------|--------|------|
| `common/cacheset/cacheset.go` | 125, 129 | `cache_hits` / `cache_misses` | Every `Slot.Get()` |
| `common/pubsub/pubsub.go` | 79, 115, 120, 206 | `sent` / `handled` / `skipped` | Every pubsub event |
| `bot/discordevents.go` | 107, 210, 1031, 1086 | `common_events_total` | Every Discord event (READY, GUILD_CREATE, MESSAGE_CREATE, RESUMED) |
| `bot/metrics.go` | 77-81 | `bot_shards_status` | Every 10s via `runUpdateMetrics()` |
| `bot/metrics.go` | 84-106 | `bot_guilds_total`, `bot_members_total`, `bot_guild_regions_total` | Every 60s |
| `bot/shardmemberfetcher/shardmemberfetcher.go` | 371, 380, 456, 463, 471, 475 | `requests`, `processed`, `failed` by type | Every member fetch attempt |
| `commands/yagcommmand.go` | 184, 264 | `executed_commands` by name & trigger_type | Every command execution |

### Prometheus HTTP Server (`common/prom/prom.go`)
```go
func startHTTPServer() {
    for {
        for _, p := range parsedPortRange {
            http.ListenAndServe(fmt.Sprintf("%s:%d", addr, p), promhttp.Handler())
        }
    }
}
```
- Configurable port range (`yagpdb.prom_listen_port_range`, default `6001-6100`)
- Runs in separate goroutine via `PluginWithCommonRun`

---

## 6. Config Reload Without Restart

### Config System (`common/config/config.go`, `common/config/redissource.go`)

**Sources (priority order, last wins)**:
1. `EnvSource` — environment variables
2. `RedisConfigStore` — Redis hash `yagpdb_config`

```go
func LoadConfig() error {
    config.AddSource(&config.EnvSource{})
    config.AddSource(&config.RedisConfigStore{Pool: RedisPool})
    config.Load()  // Iterates all registered options, calls LoadValue()
}
```

### Config Options (`common/config.go`)
```go
ConfTotalShards = config.RegisterOption("yagpdb.sharding.total_shards", "...", 0)
ConfActiveShards = config.RegisterOption("yagpdb.sharding.active_shards", "...", "")
ConfPromListenAddr = config.RegisterOption("yagpdb.prom_listen_addr", "...", "")
```

### Runtime Config Access
```go
ConfTotalShards.GetInt()     // Parsed int
ConfPromListenAddr.GetString() // Raw string
ConfEnablePrefixCommands.GetBool() // Parsed bool
```

### Reload Mechanism
**No automatic reload** — `LoadConfig()` guarded by `configLoaded` flag (`common/config.go:57, 78-81`). 

**Manual reload pattern** (via admin panel):
1. Admin saves config → `RedisConfigStore.SaveValue()` (`config/redissource.go:31-40`)
2. Publishes `evict_core_config_cache` pubsub event
3. All nodes receive → `CoreServerConfigCache.Delete(guildID)`
4. Next `GetCoreServerConfCached(guildID)` → cache miss → fetches fresh from DB/Redis

### What Requires Restart
| Setting | Reloadable? |
|---------|-------------|
| Redis address | ❌ (used to connect to Redis) |
| Postgres credentials | ❌ |
| Bot token | ❌ |
| Shard config (total/active) | ❌ (orchestrator reads at startup) |
| Prometheus port range | ❌ (server binds at startup) |
| Feature flags | ✅ (background worker polls Redis) |
| Core server config | ✅ (cache invalidation via pubsub) |

---

## 7. Additional Notable Patterns

### Redis Locking (`common/redislock.go`)
```go
TryLockRedisKey(key, maxDur)           // Non-blocking
BlockingLockRedisKey(key, maxTry, maxDur)  // Blocks with timeout
BlockingLeasedLockRedisKey(key, maxTry, lease) // Auto-renewing lease
```
Used for: gateway identify coordination, schema migrations, leader election.

### Feature Flags (`common/featureflags/bgworker.go`)
- Background worker polls Redis sets: `feature_flags_dirty_high_priority`, `feature_flags_dirty_low_priority`
- Computes flags per-guild, caches in Redis with `SUNIONSTORE`
- High-priority guilds processed every iteration, low-priority batched

### State Tracking (`lib/dstate/inmemorytracker/`)
- `InMemoryTracker` implements `dstate.Interface`
- Tracks guilds, channels, members, messages per shard
- GC loop removes offline members after configurable duration
- Used for: guild counts, member counts, presence, message cache

### Batched Writes (`bot/joinedguildsupdater/`)
- Accumulates guild join/leave/member count changes in memory
- Flushes to PostgreSQL every `flushInterval` (configurable)
- Reduces DB write load during mass guild events

---

## 8. Summary: Patterns to Adopt for Lumi v2

| Pattern | YAGPDB Implementation | Lumi v2 Adoption |
|---------|----------------------|------------------|
| **Three-tier cache** | L1: ccache/rcache, L2: Redis + pubsub invalidation, L3: PostgreSQL | ✅ Adopt — use `ristretto` or `go-cache` for L1, Redis for L2, DB for L3 |
| **CacheSet with single-flight** | `cacheset.Manager` with `sync.Cond` | ✅ Adopt — prevents thundering herd |
| **Pubsub cache invalidation** | `evict_cache_set` / `evict_core_config_cache` events | ✅ Adopt — essential for multi-node consistency |
| **Plugin interfaces** | `BotInitHandler`, `LateBotInitHandler`, `BotStopperHandler` | ✅ Adopt — explicit lifecycle hooks |
| **Service discovery** | Redis `yag_services` + `ServicePoller` | ✅ Adopt — enables dashboard→bot RPC |
| **Internal HTTP RPC** | `internalapi` plugin on each node | ✅ Adopt — for admin actions, guild-specific ops |
| **Prometheus in hot paths** | Cache hits/misses, Discord events, command exec, shard status | ✅ Adopt — instrument every critical path |
| **Config via Redis + Env** | `ConfigManager` with priority sources | ✅ Adopt — runtime config without restart for most settings |
| **Shard orchestration** | External `dshardorchestrator` process | ⚠️ Consider — adds operational complexity; Discord gateway handles sharding natively now |
| **Leased Redis locks** | `BlockingLeasedLockRedisKey` with background renewal | ✅ Adopt — for distributed coordination |

---

## 9. File Reference Index

| Area | Key Files |
|------|-----------|
| Cache L1 | `common/cacheset/cacheset.go`, `common/coreserverconf.go` |
| Cache L2 | `common/cache.go`, `common/pubsub/buildin_events.go`, `common/pubsub/pubsub.go` |
| Cache L3 | `common/coreserverconf.go:32-44`, `bot/joinedguildsupdater/` |
| Plugins | `common/plugins.go`, `bot/plugin.go`, `common/internalapi/server.go` |
| Sharding | `lib/dshardorchestrator/orchestrator/orchestrator.go`, `bot/bot.go:363-397`, `common/service.go` |
| Internal RPC | `common/internalapi/server.go`, `common/internalapi/clientutil.go`, `admin/web.go:123-147` |
| Metrics | `bot/metrics.go`, `common/cacheset/cacheset.go:236-244`, `common/prom/prom.go` |
| Config | `common/config.go`, `common/config/config.go`, `common/config/redissource.go` |
| Locking | `common/redislock.go` |
| State | `lib/dstate/inmemorytracker/tracker.go` |

---

*End of Audit*