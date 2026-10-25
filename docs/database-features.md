# PostgreSQL 18 & Redis 8 Features for Lumi v2

## PostgreSQL 18 (Released September 2025)

### Enabled Features

| Feature | Description | Usage |
|---------|-------------|-------|
| **Asynchronous I/O (AIO)** | Improves sequential scans, bitmap heap scans, vacuums | `io_method = 'io_uring'` in postgresql.conf |
| **Skip Scan** | Uses multicolumn B-tree indexes in more cases | Automatic - no config needed |
| **Temporal Constraints** | PRIMARY KEY, UNIQUE, FOREIGN KEY over ranges | `EXCLUDE USING GIST (valid_period WITH &&)` |
| **uuidv7()** | Timestamp-ordered UUIDs for better index locality | `INSERT INTO t (id) VALUES (uuidv7());` |
| **pg_upgrade Statistics** | Retains optimizer statistics after upgrade | Automatic |
| **OAuth 2.0 Auth** | Integration with SSO systems | Configure in pg_hba.conf |

### Performance Tuning (postgresql.conf)

```conf
# AIO subsystem
io_method = 'io_uring'     # Linux 5.1+
io_concurrency = 4         # AIO workers per process

# Parallel query
max_parallel_workers_per_gather = 4
max_parallel_workers = 8

# JIT compilation
jit = on

# Monitoring
shared_preload_libraries = 'pg_stat_statements,auto_explain'
```

### Migration Notes
- Dump/restore not required for 18.x → 18.x upgrades
- Reindex ltree/btree_gist indexes if upgrading from < 18.2
- AIO requires Linux kernel 5.1+ (io_uring) or falls back to worker mode

---

## Redis 8 (Released May 2025, latest 8.10.x July 2026)

### Built-in Modules (No Separate Installation)

| Module | Capability | Example |
|--------|------------|---------|
| **RediSearch** | Full-text + vector similarity search | `FT.CREATE idx ... VECTOR FLAT 6 DIM 384` |
| **RedisJSON** | Native JSON document support | `JSON.SET doc $ '{"title": "hi"}'` |
| **RedisTimeSeries** | Time-series data with downsampling | `TS.CREATE metric RETENTION 86400000` |
| **RedisBloom** | Probabilistic data structures | `BF.ADD filter item` |

### New Core Features

| Feature | Description | Usage |
|---------|-------------|-------|
| **Hash Field Expiration** | TTL per hash field | `HSET key field value EX 3600` |
| **Client-Side Caching** | Invalidation via tracking | `CLIENT CACHING YES` |
| **Vector Search** | k-NN with cosine/L2 distance | `FT.SEARCH idx "*=>[KNN 5 @embedding $vec]"` |
| **Enhanced ACL** | SORT access control | `USER foo (+sort ~* ~mylist)` |
| **Metrics Stream** | Real-time metrics feed | `XREAD STREAMS metrics $` |

### Security Fixes (8.0.6+)
- CVE-2025-46818: Lua script user context isolation
- CVE-2025-46819: Lua out-of-bound read
- CVE-2025-48367: Connection acceptance retry

### Configuration (redis.conf)
```conf
# Memory
maxmemory 2gb
maxmemory-policy allkeys-lru

# Persistence
appendonly yes
appendfsync everysec

# Performance
activedefrag yes

# Built-in modules auto-loaded
# No module load commands needed
```

---

## Lumi v2 Integration

### Database Schema Benefits
```sql
-- uuidv7 for naturally ordered IDs (better index performance)
CREATE TABLE economy_users (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    guild_id UUID NOT NULL,
    user_id TEXT NOT NULL,
    balance BIGINT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Temporal constraints for audit logs
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    valid_period TSTZRANGE NOT NULL,
    EXCLUDE USING GIST (valid_period WITH &&)
);

-- JSON columns for flexible module config
CREATE TABLE guild_modules (
    guild_id UUID NOT NULL,
    module_name TEXT NOT NULL,
    config JSONB DEFAULT '{}',
    PRIMARY KEY (guild_id, module_name)
);
```

### Redis Usage Patterns
```typescript
// Vector similarity for semantic search
await redis.ft.create('idx', {
    '$.content': { type: 'TEXT' },
    '$.embedding': { type: 'VECTOR', dim: 384, distance_metric: 'COSINE' }
});

// JSON document storage
await redis.json.set('config:guild:123', '$', { currency: 'Credits', shop: [...] });

// Time-series for metrics
await redis.ts.create('lumi:metrics:guild:123:cpu', { retention: 86400000 });
await redis.ts.add('lumi:metrics:guild:123:cpu', '*', cpuUsage);

// Client-side caching
const client = redis.clientCaching();
await client.set('cache:key', data);
client.on('invalidate', (keys) => { /* handle invalidation */ });
```

### Performance Impact
| Operation | PostgreSQL 16 | PostgreSQL 18 | Improvement |
|-----------|--------------|---------------|-------------|
| Sequential Scan | Standard | AIO | 2-5x faster |
| Vacuum | Standard | AIO | 30-50% faster |
| Skip Scan | Limited | Full | New index usage |
| Upgrade Time | Full stats recompute | Retained stats | 80% faster |

| Operation | Redis 7 | Redis 8 | Improvement |
|-----------|---------|---------|-------------|
| Search/Vector | External module | Built-in | No deploy overhead |
| JSON | External module | Native | 10x faster |
| MGET/MSET | Standard | Optimized | 2-3x faster |
| Hash TTL | Not supported | Per-field | New capability |