# Lumi Configuration Architecture & Reference

This directory contains the operational and infrastructure configurations for Lumi. Configuration in Lumi is partitioned into **Application-Level Settings** (`bot.json`, `emojis.json`) and **Infrastructure-Level Stack Configurations** (`postgres/`, `redis/`, `rabbitmq/`, `observability/`, `advanced.config`).

> [!NOTE]
> Application configuration files (`bot.json` and `emojis.json`) are optional. Lumi ships with production-grade defaults compiled directly into the binary. Any values provided in `config/bot.json` or `config/emojis.json` are deeply merged on top of internal defaults at boot time.

---

## Application Configuration

### `bot.json`

The `bot.json` file configures runtime presence, color schemes, external links, permission tier titles, and user interface pagination defaults.

```json
{
  "presence": {
    "activityType": 3,
    "activityText": "the server",
    "status": "online"
  },
  "branding": {
    "colors": {
      "PRIMARY": 5793266,
      "SUCCESS": 5763719,
      "ERROR": 15548997,
      "WARNING": 16705372,
      "INFO": 5793266,
      "NEUTRAL": 5198940,
      "GOLD": 16762880
    },
    "links": {
      "supportServer": "",
      "website": "",
      "github": ""
    }
  },
  "permissions": {
    "names": {
      "USER": "User",
      "MOD": "Moderator",
      "ADMIN": "Administrator",
      "GUILD_OWNER": "Server Owner",
      "BOT_OWNER": "Bot Owner"
    }
  },
  "ui": {
    "defaultListPerPage": 10
  }
}
```

#### Configuration Options

| Option Path | Type | Description | Default / Values |
| :--- | :--- | :--- | :--- |
| `presence.activityType` | `number` | Discord activity type enumeration | `0` (Playing), `1` (Streaming), `2` (Listening), `3` (Watching), `5` (Competing) |
| `presence.activityText` | `string` | Text displayed in the bot status activity line | `"the server"` |
| `presence.status` | `string` | Gateway client online status | `"online"`, `"idle"`, `"dnd"`, `"invisible"` |
| `branding.colors.*` | `number` | Decimal integer representations of embed accent colors | e.g. `5793266` (`#5865F2` Blurple), `5763719` (`#57F287` Green), `15548997` (`#ED4245` Red) |
| `branding.links.supportServer` | `string` | Discord invite URL surfaced in help and information cards | `""` |
| `branding.links.website` | `string` | Official website URL surfaced in bot metadata | `""` |
| `branding.links.github` | `string` | Source code repository URL | `""` |
| `permissions.names.*` | `string` | Display labels for internal permission hierarchy levels | Human-readable strings (`"User"`, `"Moderator"`, `"Administrator"`, etc.) |
| `ui.defaultListPerPage` | `number` | Default number of items per page in paginated UI components | `10` |

---

### `emojis.json`

`emojis.json` defines named emoji identifiers used across cards, status messages, and command responses. Values can be unicode glyphs or custom Discord emojis formatted as `<:name:id>` (or `<a:name:id>` for animated emojis).

> [!TIP]
> Any key omitted from `emojis.json` automatically falls back to Lumi's built-in unicode emoji mapping. You only need to declare keys you wish to override.

```json
{
  "SUCCESS": "🟢",
  "CHECK": "✅",
  "ERROR": "🔴",
  "CROSS": "❌",
  "WARNING": "🟡",
  "INFO": "🔵",
  "ADMIN": "🛡️",
  "SHIELD": "🛡️",
  "RAID": "🚨",
  "BOT": "🤖",
  "ARROW_RIGHT": "➡️",
  "CLOCK": "🕐",
  "TERMINAL": "💻",
  "CROWN": "👑",
  "WARNING_SIGN": "⚠️",
  "LOCKDOWN": "🔒",
  "GUILD": "🏰",
  "SPACE": "⠀",
  "LATENCY": "📡",
  "UPTIME": "⏱️",
  "TRADE": "📊",
  "MEMORY": "🧠",
  "POSITION": "📈",
  "SERVERS": "🏰",
  "MEMBERS": "👥",
  "REDIS": "🔴",
  "SQL": "🐘",
  "RABBIT": "🐇"
}
```

---

## Infrastructure Stack Configuration

The subdirectories within `config/` house operational parameters and initialization scripts for Docker Compose and production cluster deployments.

```
config/
├── advanced.config           # RabbitMQ legacy metrics Permit configuration
├── bot.json                  # Application presence, branding, & UI settings
├── emojis.json               # Application emoji symbol mappings
├── rabbitmq.conf             # RabbitMQ single-node base configuration
├── postgres/
│   ├── init-replication.sh   # Primary DB bootstrap script (creates replicator role)
│   ├── pg_hba.conf           # PostgreSQL host-based authentication rules
│   ├── primary.conf          # PostgreSQL WAL & replication parameters
│   └── replica-entrypoint.sh # Standby DB bootstrap script (runs pg_basebackup)
├── rabbitmq/
│   ├── apply-ha-policy.sh    # REST API policy script setting default queue type to quorum
│   └── rabbitmq-ha.conf      # 3-node static cluster peer discovery & autoheal policy
├── redis/
│   ├── redis-replica.conf    # Redis replica node configuration
│   └── sentinel-entrypoint.sh # Dynamic Sentinel configuration boot generator
└── observability/
    ├── alerts.yml            # Prometheus alert rules for Lumi SLOs
    ├── otel-collector.yaml   # OpenTelemetry collector HTTP receiver & Tempo exporter pipeline
    ├── prometheus.yml        # Prometheus target scrape configurations
    ├── tempo.yaml            # Grafana Tempo tracing storage engine settings
    └── grafana/
        └── provisioning/     # Automated Grafana dashboard & datasource provisioning
```

---

### Database Infrastructure (`postgres/` & `redis/`)

#### PostgreSQL Streaming Replication (`config/postgres/`)

Lumi's database architecture uses PostgreSQL 17 streaming replication paired with PgBouncer connection pooling.

* **`primary.conf`**: Configures Write-Ahead Logging (WAL) and memory buffers on the primary database instance:

| Parameter | Value | Purpose |
| :--- | :--- | :--- |
| `listen_addresses` | `'*'` | Accepts incoming connections across container network interfaces |
| `max_connections` | `200` | Upper bound for direct client connections |
| `wal_level` | `replica` | Logs extra information to WAL required for streaming replication |
| `max_wal_senders` | `10` | Maximum number of concurrent replication connections |
| `max_replication_slots` | `10` | Reserved slots for standby nodes |
| `wal_keep_size` | `512MB` | Minimum WAL size retained in `pg_wal` for standby catch-up |
| `hot_standby` | `on` | Allows read-only queries during recovery on standbys |
| `wal_log_hints` | `on` | Writes page headers to WAL during non-critical writes (required by `pg_basebackup`) |
| `shared_buffers` | `64MB` | Dedicated shared memory buffer for database caching |
| `effective_cache_size` | `192MB` | Query planner estimate of total disk cache available |

* **`pg_hba.conf`**: Security policy enforcing `scram-sha-256` password authentication for standard application connections and authorizing the `replicator` user for streaming replication traffic.
* **`init-replication.sh`**: Executes during primary database container initialization inside `/docker-entrypoint-initdb.d` to create the replication role:
  ```bash
  CREATE ROLE replicator WITH REPLICATION LOGIN ENCRYPTED PASSWORD 'replicator';
  ```
* **`replica-entrypoint.sh`**: Standby boot wrapper. If `$PGDATA/PG_VERSION` is missing, it executes `pg_basebackup` against the primary with `-R` (generating `standby.signal` and `primary_conninfo` automatically), then executes standard PostgreSQL startup.

#### Redis & Sentinel High Availability (`config/redis/`)

* **`redis-replica.conf`**: Defines replication node behavior with `appendonly yes`, `maxmemory 128mb`, and `maxmemory-policy noeviction`.
* **`sentinel-entrypoint.sh`**: Dynamically generates `/data/sentinel.conf` at runtime before starting `redis-sentinel`. Key environment variable controls include:

| Environment Variable | Default | Description |
| :--- | :--- | :--- |
| `SENTINEL_MASTER_NAME` | `mymaster` | Symbolic name assigned to the Redis master set |
| `SENTINEL_MASTER_HOST` | `redis` | Hostname of the primary Redis instance |
| `SENTINEL_MASTER_PORT` | `6379` | Network port of the primary Redis instance |
| `SENTINEL_QUORUM` | `2` | Number of Sentinels required to reach quorum for failover |
| `SENTINEL_DOWN_AFTER_MS` | `5000` | Milliseconds of unreachability before declaring a node down |
| `SENTINEL_FAILOVER_TIMEOUT_MS` | `30000` | Timeout period for a failover execution |
| `SENTINEL_PARALLEL_SYNCS` | `1` | Number of replicas reconfigured in parallel during failover |

---

### Message Queue Infrastructure (`rabbitmq/`)

Lumi utilizes RabbitMQ for cross-service events and RPC dispatches between Gateway, Worker, and Scheduler instances.

* **`rabbitmq.conf` & `advanced.config`**: Contains `deprecated_features.permit.management_metrics_collection = true` to preserve compatibility with standard Prometheus exporter metrics endpoints in RabbitMQ 4.x.
* **`rabbitmq/rabbitmq-ha.conf`**: Multi-node static cluster configuration (`rabbit@rabbitmq`, `rabbit@rabbitmq-2`, `rabbit@rabbitmq-3`) utilizing `classic_config` peer discovery and automatic partition healing (`cluster_partition_handling = autoheal`).
* **`rabbitmq/apply-ha-policy.sh`**: Executes a curl request against the RabbitMQ Management API (`PUT /api/vhosts/%2F`) to apply `{"default_queue_type":"quorum"}` on the default vhost `/`. This guarantees all newly declared queues use Raft consensus replication across nodes.

---

### Observability & Telemetry Stack (`observability/`)

Lumi includes an enterprise-grade telemetry pipeline integrating Prometheus, OpenTelemetry Collector, Grafana Tempo, and Grafana.

```
[ Lumi Services ] --(Metrics / 9090)--> [ Prometheus ] ----> [ Grafana ]
        |                                                              ^
  (OTLP / 4318)                                                        |
        v                                                              |
[ OTEL Collector ] --(gRPC / 4317)----> [ Tempo ] ---------------------+
```

#### Metrics & Alerting (`prometheus.yml` & `alerts.yml`)

`prometheus.yml` is configured with a 15-second scrape interval targeting `:9090` across all Lumi microservices (`worker`, `gateway`, `scheduler`, `api`) and `:9000` for `nirn-proxy`.

`alerts.yml` defines Service Level Objective (SLO) alert rules loaded into Prometheus:

| Alert Name | Severity | Condition | Description |
| :--- | :--- | :--- | :--- |
| `ShardDown` | `critical` | `min(lumi_shard_status) == 0` for 1m | Discord Gateway shard disconnect or heartbeat loss |
| `QueueLagGrowing` | `warning` | `max(lumi_queue_depth) > 1000` for 5m | Message processing queues backing up |
| `Rest429Spike` | `warning` | `rate(lumi_rest_429_total[5m]) > 1` for 2m | Sustained Discord REST rate-limiting |
| `DbPoolSaturation` | `warning` | Database waiters > 0 or usage > 90% for 3m | Connection pool exhaustion |
| `StreamConsumerLag` | `warning` | `max(lumi_stream_consumer_lag) > 1000` for 5m | Event bus consumer group lag |
| `StreamDlqGrowing` | `warning` | `max(lumi_stream_dlq_length) > 0` for 1m | Messages routed to Dead-Letter Queue |
| `RestInvalidRequestSurge` | `critical` | `rate(lumi_rest_invalid_request_warnings_total[5m]) > 0.1` for 2m | Surge in 401/403/429 responses threatening Cloudflare IP ban (10k limit) |
| `CommandErrorRate` | `warning` | Error rate > 5% over 5m | Spiking application command failures |
| `NodeHeapPressure` | `warning` | V8 heap memory > 85% of limit for 5m | Potential memory leak or tight memory limit |

#### Distributed Tracing (`otel-collector.yaml` & `tempo.yaml`)

* **`otel-collector.yaml`**: Ingests OpenTelemetry HTTP traces on `0.0.0.0:4318`, applies batch processing with a 5-second timeout, and exports traces over OTLP gRPC to `tempo:4317`.
* **`tempo.yaml`**: Runs Grafana Tempo listening on port `3200` for HTTP and port `4317` for OTLP gRPC. Writes Write-Ahead Logs to `/var/tempo/wal` and trace blocks to local disk `/var/tempo/blocks`.
* **`grafana/`**: Auto-provisions Prometheus and Tempo datasources along with pre-built dashboards (`lumi-overview.json` and `lumi-cost.json`).

---

## Verification

To verify configuration file syntax and validate local infrastructure setup:

```bash
# Validate Docker Compose stack configurations
docker compose config

# Test Prometheus configuration and alert rules syntax
docker run --rm -v $(pwd)/config/observability:/etc/prometheus prom/prometheus:v3.0.1 check config /etc/prometheus/prometheus.yml
```
