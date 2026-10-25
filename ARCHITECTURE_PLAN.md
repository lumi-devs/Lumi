# Lumi V2 - Comprehensive Architecture & Porting Plan

## Executive Summary

Port Lumi V1 (TypeScript) + Lumi RS (Rust) → Lumi V2 (Bun monorepo) with:
- **Multi-process fleet architecture** (YAGPDB-style shard orchestration)
- **Enhanced permit system** with time-based permits
- **Core/Admin/Security as built-in non-disableable services** (not modules)
- **Domain-driven code organization** for maintainability
- **RPC layer** for dashboard ↔ bot + inter-process communication
- **Sheet planner** system

---

## 1. Target Architecture

### 1.1 Multi-Process Fleet (YAGPDB-Style)

```
┌─────────────────────────────────────────────────────────────────┐
                        CONTROL PLANE
  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
  │  Manager    │  │  Manager    │  │  Manager    │  (HA: 3 nodes)
  │  Process    │  │  Process    │  │  Process    │   Raft consensus
  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘
         │                │                │
         └────────────────┼────────────────┘
                          ▼
         ┌────────────────────────────────┐
         │     Redis Cluster / Sentinel   │  (Pub/Sub, Locks, Cache L2)
         │     PostgreSQL (Primary + RO)  │  (Config, Permits, Economy, Leveling)
         └────────────────────────────────┘
                          │
         ┌────────────────┼────────────────┐
         ▼                ▼                ▼
┌───────────────┐ ┌───────────────┐ ┌───────────────┐
│  Worker Node  │ │  Worker Node  │ │  Worker Node  │  (N nodes, auto-scaled)
│  Shards 0-511 │ │  Shards 512-  │ │  Shards ...   │
│  (Process)    │ │  1023         │ │               │
└───────────────┘ └───────────────┘ └───────────────┘
```

**Key Components:**
- **Manager Process**: Shard allocation, health monitoring, rolling deployments, config distribution
- **Worker Process**: Handles assigned shards, connects to Discord gateway, processes events
- **Shared State**: Redis (cache, pub/sub, distributed locks), PostgreSQL (source of truth)
- **Inter-Process RPC**: gRPC/ConnectRPC for manager↔worker, worker↔worker, dashboard↔manager

### 1.2 Domain-Driven Package Structure

```
lumi-v2/
├── apps/
│   ├── bot/                    # Worker process entry point
│   ├── manager/                # Manager process entry point
│   └── cli/                    # `lumi` CLI tool
├── packages/
│   ├── domain-core/            # ✅ Built-in: Core bot lifecycle, gateway, sharding
│   ├── domain-admin/           # ✅ Built-in: Admin commands, module mgmt, settings
│   ├── domain-security/        # ✅ Built-in: Verification, panic, antinuke, join-gate
│   ├── domain-permits/         # ✅ Built-in: Permit evaluation, time-based, conditions
│   ├── domain-tempvc/          # ✅ Built-in: Temporary voice channels
│   ├── domain-leveling/        # ✅ Built-in: XP, ranks, rewards, leaderboards
│   ├── domain-economy/         # ✅ Built-in: Currency, shop, inventory, banking
│   ├── domain-filter/          # ✅ Built-in: Auto-mod, word/phrase/regex filters
│   ├── domain-utility/         # ✅ Built-in: Avatar, whois, serverinfo, purge, nick
│   ├── domain-mod/             # 🔌 Module: Case-backed moderation (ban, kick, mute, warn)
│   ├── domain-logging/         # 🔌 Module: Message/edit/delete/voice logging
│   ├── domain-welcome/         # 🔌 Module: Welcome/leave messages, DM on join
│   ├── domain-reactionroles/   # 🔌 Module: Reaction/button role menus
│   ├── domain-afk/             # 🔌 Module: AFK system
│   ├── domain-onboarding/      # 🔌 Module: Server onboarding flow
│   ├── domain-sticky/          # 🔌 Module: Sticky messages
│   ├── domain-sheets/          # 🔌 Module: Spreadsheet automation
│   │
│   ├── module-kit/             # Module contracts (defineModule, types)
│   ├── module-runtime/         # Module loader, lifecycle, discovery
│   ├── downloader/             # Addon install/update/validation
│   ├── cache/                  # L1 (LRU) + L2 (Redis) cache with invalidation bus
│   ├── redis/                  # Redis client, pub/sub, locks, invalidation
│   ├── db/                     # Prisma client, repositories, migrations
│   ├── rpc/                    # RPC router, ConnectRPC server, client stubs
│   ├── ui/                     # Card system, components, embed builders
│   ├── observability/          # OpenTelemetry, Prometheus, health probes
│   ├── scheduler/              # Cron jobs, recurring tasks, distributed locks
│   ├── discord/                # Discord.js wrappers, helpers, type extensions
│   └── config/                 # Env validation, config schema, hot-reload
```

### 1.3 Built-in vs Module Boundary

| Built-in (Non-disableable) | Toggleable Modules |
|---------------------------|-------------------|
| `domain-core` - Gateway, sharding, event dispatch | `domain-mod` |
| `domain-admin` - `/module`, `/config`, `/lumi` panel | `domain-logging` |
| `domain-security` - Verification, panic, antinuke | `domain-welcome` |
| `domain-permits` - Permit eval, time-based, conditions | `domain-reactionroles` |
| `domain-tempvc` - Join-to-create, ephemeral VC | `domain-afk` |
| `domain-leveling` - XP, ranks, role rewards | `domain-onboarding` |
| `domain-economy` - Currency, shop, banking | `domain-sticky` |
| `domain-filter` - Auto-mod, content filters | `domain-sheets` |
| `domain-utility` - Info commands, purge, nick | (future addons) |

**Rationale**: Security/Admin/Core are the *platform*. They must always be available for the bot to function safely. Modules are *features* that guilds can opt into.

---

## 2. Porting Strategy: V1 → V2

### 2.1 Port Priority Matrix

| Priority | V1 Module | V2 Target | Notes |
|----------|-----------|-----------|-------|
| P0 | `core` | `domain-core` | Gateway, sharding, RPC server, scheduler |
| P0 | `admin` | `domain-admin` | Module mgmt, config, `/lumi` panel |
| P0 | `security` | `domain-security` | Verification, panic, antinuke, join-gate |
| P0 | `permits` (lib) | `domain-permits` | **Enhanced**: time-based, conditions |
| P0 | `tempvc` | `domain-tempvc` | Join-to-create, owner transfer, limits |
| P0 | `leveling` | `domain-leveling` | XP curves, role rewards, leaderboards, **images** |
| P0 | `economy` | `domain-economy` | Currency, shop, inventory, banking, **images** |
| P0 | `filter` | `domain-filter` | Regex/word/phrase, automod actions |
| P0 | `utility` | `domain-utility` | Avatar, banner, whois, serverinfo, purge |
| P1 | `mod` | `domain-mod` (module) | Cases, thresholds, immune roles, voice mute |
| P1 | `logging` | `domain-logging` (module) | Message/voice/modlog, webhook delivery |
| P1 | `welcome` | `domain-welcome` (module) | Join/leave, DM, embed cards |
| P1 | `reactionroles` | `domain-reactionroles` (module) | Buttons, selects, modes (unique/multi) |
| P1 | `afk` | `domain-afk` (module) | AFK set, mention reply, nick prefix |
| P1 | `onboarding` | `domain-onboarding` (module) | Rules screening, channel hints |
| P1 | `sticky` | `domain-sticky` (module) | Sticky message persistence |
| P1 | (new) | `domain-sheets` (module) | Spreadsheet automation |

### 2.2 Lumi RS Ports (Rust → TypeScript)

| RS Crate | V1 Equivalent | V2 Target | Notes |
|----------|---------------|-----------|-------|
| `kernel` | `lib/*` | `packages/cache`, `packages/redis`, `packages/db` | Core infra |
| `modules` | `src/modules/*` | `packages/domain-*` | All domain packages |
| `api` | RPC contracts | `packages/rpc` | ConnectRPC definitions |
| `db` | Prisma | `packages/db` | Shared Prisma schema |
| `ui` | `@ui/*` | `packages/ui` | Card system port |

**Key RS Advantages to Preserve:**
- Zero-copy cache codec (devalue equivalent)
- Lock-free Redis pipelines
- Compile-time RPC schema validation
- Memory-efficient leveling XP calculations

---

## 3. Enhanced Permit System Design

### 3.1 Data Model Extensions

```prisma
model Permit {
  id            Int      @id @default(autoincrement())
  guildId       String
  name          String
  node          String   // e.g., "mod.ban", "admin.*"
  kind          PermitKind   // CUSTOM | ENFORCED
  polarity      Polarity   // GRANT | DENY
  position      Int      // Display order
  builtin       Boolean  @default(false)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  // NEW: Time-based permits
  expiresAt     DateTime?        // Null = permanent
  schedule      Json?            // Cron expression for recurring grants
  timezone      String?          // IANA tz for schedule

  // NEW: Condition-based permits
  conditions    Json?            // { channelIds?: string[], roleIds?: string[], ... }

  assignments   PermitAssignment[]

  @@unique([guildId, name])
  @@index([guildId])
}

model PermitAssignment {
  id        Int          @id @default(autoincrement())
  permitId  Int
  permit    Permit       @relation(fields: [permitId], references: [id], onDelete: Cascade)
  targetType PermitTargetType  // USER | ROLE | CHANNEL
  targetId  String
  grantedAt DateTime     @default(now())
  grantedBy String       // User ID who granted

  // NEW: Time-bound assignment
  expiresAt DateTime?    // Overrides permit.expiresAt if set

  @@unique([permitId, targetType, targetId])
  @@index([permitId])
  @@index([targetType, targetId])
}
```

### 3.2 Evaluation Logic (Extended)

```typescript
// packages/domain-permits/src/evaluator.ts

interface PermitCondition {
  channelIds?: string[];      // Only valid in these channels
  roleIds?: string[];         // Only valid if user has ANY of these roles
  notRoleIds?: string[];      // Invalid if user has ANY of these roles
  timeWindow?: {              // Only valid during these hours (guild timezone)
    start: string;            // "09:00"
    end: string;              // "17:00"
    days?: number[];          // 0=Sun, 1=Mon... (optional, default all)
  };
}

async function evaluatePermit(options: EvaluatePermitOptions): Promise<EvaluatedPermit> {
  // ... existing tiers (owner, manager) ...

  // NEW: Fetch permits with time/condition filtering
  const permits = await db.permits.getValidPermits(guildId, {
    userId: options.userId,
    roleIds: options.roleIds,
    channelId: options.channelId,
    at: new Date(),  // For time-based evaluation
  });

  // Evaluate with conditions
  for (const permit of permits) {
    if (!matchesConditions(permit, options)) continue;
    if (!matchesTimeWindow(permit, options.guildId)) continue;
    
    // ... existing grant/deny logic ...
  }
}

function matchesConditions(permit: Permit, options: EvaluatePermitOptions): boolean {
  if (!permit.conditions) return true;
  const c = permit.conditions as PermitCondition;
  
  if (c.channelIds?.length && !c.channelIds.includes(options.channelId!)) return false;
  if (c.roleIds?.length && !options.roleIds?.some(r => c.roleIds!.includes(r))) return false;
  if (c.notRoleIds?.length && options.roleIds?.some(r => c.notRoleIds!.includes(r))) return false;
  
  return true;
}
```

### 3.3 Panel & RPC Extensions

- **Panel**: Add "Expires" column, "Schedule" field, "Conditions" modal
- **RPC**: `guild.permits.create`/`update` accept `expiresAt`, `schedule`, `conditions`
- **CLI**: `lumi permit grant --expires-in 24h --condition channel=#mod`

---

## 4. Domain Package Specifications

### 4.1 domain-core (Built-in)

**Responsibilities:**
- Discord gateway connection & sharding
- Event dispatch (with permit evaluation middleware)
- RPC server (ConnectRPC) for dashboard + inter-process
- Scheduler (distributed cron with leader election)
- Health checks, metrics, graceful shutdown

**Key Files:**
```
packages/domain-core/
├── src/
│   ├── gateway/
│   │   ├── ShardManager.ts       # Shard lifecycle, resume, identify
│   │   ├── FleetClient.ts        # gRPC client to manager process
│   │   └── ShardAllocator.ts     # (Manager only) Shard → worker assignment
│   ├── rpc/
│   │   ├── RpcServer.ts          # ConnectRPC server
│   │   ├── routes/               # Auto-discovered from domain packages
│   │   └── interceptors/         # Auth, logging, metrics
│   ├── scheduler/
│   │   ├── DistributedScheduler.ts  # Redis-locked cron jobs
│   │   └── JobRegistry.ts
│   ├── lifecycle/
│   │   ├── Boot.ts               # Startup sequence
│   │   ├── Shutdown.ts           # Graceful drain
│   │   └── Health.ts             # /health, /ready endpoints
│   └── index.ts                  # Exports: createCoreServices()
├── tests/
└── package.json
```

### 4.2 domain-admin (Built-in)

**Responsibilities:**
- Module enable/disable/reload (global + per-guild)
- Config management (GUI + CLI)
- `/lumi` control panel (permissions, modules, settings)
- Bot owner commands (deploy, restart, eval)

**Key Files:**
```
packages/domain-admin/
├── src/
│   ├── commands/
│   │   ├── ModuleCommands.ts     # /module enable|disable|list|reload
│   │   ├── ConfigCommands.ts     # /config get|set|reset|export
│   │   ├── PanelCommands.ts      # /lumi (main control panel)
│   │   └── OwnerCommands.ts      # /deploy, /restart, /eval (bot owner only)
│   ├── panel/
│   │   ├── ModulePanel.ts        # Module list, enable/disable, config
│   │   ├── PermitPanel.ts        # Permit list, grant, revoke, order, explain
│   │   └── SettingsPanel.ts      # Bot-wide settings
│   ├── services/
│   │   ├── ModuleManager.ts      # Load/unload/reload modules
│   │   └── ConfigService.ts      # Config CRUD with validation
│   └── index.ts
```

### 4.3 domain-security (Built-in)

**Responsibilities:**
- Verification (emoji, button, captcha, question)
- Panic mode (lockdown @everyone)
- Anti-nuke (threshold-based action on mass events)
- Join gate (heuristics, alt detection, raid protection)

**Port from V1:** `AntiNuke.ts`, `Verification.ts`, `Panic.ts`, `JoinGate.ts`, `JoinHeuristics.ts`, `Captcha.ts`

### 4.4 domain-permits (Built-in)

**Responsibilities:**
- Permit evaluation (core logic)
- Time-based permits (expiry, schedules)
- Condition-based permits (channel, role, time window)
- Caching (5-min per target, invalidation on change)
- Panel integration (explain, grant, revoke, reorder)

### 4.5 domain-tempvc (Built-in)

**Responsibilities:**
- Join-to-create voice channels
- Channel ownership (transfer, claim)
- Limits (per-user, per-guild, per-category)
- Auto-cleanup (empty timeout, owner leave)
- Settings: name template, bitrate, user limit, region

**Port from V1:** `TempVcService.ts`, `TempVcListener.ts`, config schema

### 4.6 domain-leveling (Built-in)

**Responsibilities:**
- XP gain (message, voice, custom events)
- Configurable XP curves (formula or lookup table)
- Role rewards (grant/remove on level up)
- Leaderboards (global, guild, weekly/monthly)
- **Level-up images** (canvas/SVG generation, CDN upload)
- Prestige/rebirth system
- XP multipliers (role-based, channel-based, time-based)

**Port from V1:** `LevelingService.ts`, `XpCalculator.ts`, `RewardManager.ts`, image generation

### 4.7 domain-economy (Built-in)

**Responsibilities:**
- Multi-currency support (primary + premium)
- Balance, transfer, deposit/withdraw (bank)
- Shop (roles, items, custom), inventory
- Jobs/work (cooldowns, payout ranges)
- Gambling (slots, coinflip, blackjack - configurable)
- **Economy images** (balance cards, shop items, leaderboards)
- Taxation, interest, daily/weekly/monthly rewards

**Port from V1:** `EconomyService.ts`, `ShopService.ts`, `BankService.ts`, image generation

### 4.8 domain-filter (Built-in)

**Responsibilities:**
- Word/phrase/regex filters (per-guild, per-channel)
- Actions: delete, warn, mute, kick, ban, log
- Context: message content, embeds, attachments, stickers
- Whitelist (roles, channels, users)
- Regex tester in panel
- **ML-based toxicity** (optional, via external API)

**Port from V1:** `FilterService.ts`, `PatternMatcher.ts`, automod integration

### 4.9 domain-utility (Built-in)

**Responsibilities:**
- `/avatar`, `/banner`, `/whois`, `/serverinfo`
- `/purge` (with filters: user, bot, contains, links, attachments)
- `/nick` (with permit check)
- `/roleinfo`, `/channelinfo`, `/emojiinfo`
- Timezone conversion, reminders

---

## 5. Module System (Toggleable Features)

### 5.1 Module Kit Contracts (packages/module-kit)

```typescript
// packages/module-kit/src/contracts.ts

export interface ModuleDefinition {
  name: string;
  displayName: string;
  emoji: string;
  description: string;
  version: string;
  config: z.ZodObject<any>;
  configFields: ConfigField[];
  commands: CommandDefinition[];
  listeners: ListenerDefinition[];
  tasks: TaskDefinition[];
  onLoad: (services: ModuleServices) => Promise<Disposer[]>;
  onUnload: (services: ModuleServices) => Promise<void>;
  dependencies?: Record<string, string>;  // moduleName -> semver
  requirements?: string[];                 // npm packages
  conflicts?: string[];                    // conflicting module names
  capabilities?: ModuleCapability[];
}

export interface ModuleCapability {
  name: string;        // e.g., "modlog", "starboard"
  version: string;
  provides: string[];  // RPC methods, events, services
}
```

### 5.2 Module Runtime (packages/module-runtime)

- Discovery: `modules/` (bundled) + `data/addons/` (installed)
- Validation: manifest.json + entry file + zod config
- Topological sort by dependencies
- Lifecycle: load → onLoad → register commands/listeners → track disposers
- Guild enablement: `services.modules.isEnabled(guildId, name)`

---

## 6. RPC Layer (ConnectRPC)

### 6.1 Schema (packages/rpc/proto)

```protobuf
// lumi/v2/permits.proto
package lumi.v2;

service PermitService {
  rpc ListPermits(ListPermitsRequest) returns (ListPermitsResponse);
  rpc CreatePermit(CreatePermitRequest) returns (CreatePermitResponse);
  rpc UpdatePermit(UpdatePermitRequest) returns (UpdatePermitResponse);
  rpc DeletePermit(DeletePermitRequest) returns (DeletePermitResponse);
  rpc MovePermit(MovePermitRequest) returns (MovePermitResponse);
  rpc AssignPermit(AssignPermitRequest) returns (AssignPermitResponse);
  rpc UnassignPermit(UnassignPermitRequest) returns (UnassignPermitResponse);
  rpc ExplainPermit(ExplainPermitRequest) returns (ExplainPermitResponse);
  rpc GetExpiringPermits(GetExpiringPermitsRequest) returns (GetExpiringPermitsResponse);  // NEW
}

// lumi/v2/fleet.proto
service FleetService {
  rpc GetFleetStatus(GetFleetStatusRequest) returns (FleetStatus);
  rpc GetShardAssignment(GetShardAssignmentRequest) returns (ShardAssignment);
  rpc RebalanceShards(RebalanceShardsRequest) returns (RebalanceShardsResponse);
  rpc GetNodeHealth(GetNodeHealthRequest) returns (NodeHealth);
  rpc TriggerRollingRestart(TriggerRollingRestartRequest) returns (RollingRestartStatus);
}

// lumi/v2/leveling.proto
service LevelingService {
  rpc GetLeaderboard(GetLeaderboardRequest) returns (LeaderboardResponse);
  rpc GetUserRank(GetUserRankRequest) returns (UserRankResponse);
  rpc GenerateRankCard(GenerateRankCardRequest) returns (RankCardResponse);  // Image
  rpc SetXpCurve(SetXpCurveRequest) returns (SetXpCurveResponse);
}

// lumi/v2/economy.proto
service EconomyService {
  rpc GetBalance(GetBalanceRequest) returns (BalanceResponse);
  rpc Transfer(TransferRequest) returns (TransferResponse);
  rpc GetShop(GetShopRequest) returns (ShopResponse);
  rpc BuyItem(BuyItemRequest) returns (BuyItemResponse);
  rpc GenerateBalanceCard(GenerateBalanceCardRequest) returns (BalanceCardResponse);  // Image
}
```

### 6.2 Transport

- **Dashboard → Manager**: HTTP/2 + ConnectRPC (TLS)
- **Manager ↔ Workers**: gRPC (internal network, mTLS)
- **Worker ↔ Worker**: gRPC for cross-shard operations (e.g., global leaderboard)

---

## 7. Sheet Planner (Spreadsheet-like Automation)

**Concept**: Guild admins create "sheets" (like Google Sheets) with formulas that automate responses/actions.

```typescript
// packages/domain-sheets/src/types.ts

interface Sheet {
  id: string;
  guildId: string;
  name: string;
  description?: string;
  rows: SheetRow[];
  triggers: SheetTrigger[];
  enabled: boolean;
}

interface SheetRow {
  id: string;
  // Column A: Trigger pattern (regex, keyword, command)
  trigger: string;
  // Column B: Conditions (permit, channel, role, time)
  conditions: SheetCondition[];
  // Column C: Actions (reply, embed, role, webhook, RPC call)
  actions: SheetAction[];
  // Column D: Cooldown (per user/channel/guild)
  cooldown?: CooldownSpec;
  // Column E: Priority (higher runs first)
  priority: number;
}

interface SheetAction {
  type: 'reply' | 'embed' | 'role_add' | 'role_remove' | 'webhook' | 'rpc' | 'custom';
  config: Record<string, any>;
  // Templating: {user}, {channel}, {guild}, {matched}, {capture:N}
  template?: string;
}

interface SheetTrigger {
  type: 'message' | 'command' | 'reaction' | 'voice_state' | 'member_join' | 'schedule';
  config: Record<string, any>;
}
```

**Use Cases:**
- Auto-responder (keyword → reply)
- FAQ system (question → answer card)
- Role menu (reaction → role)
- Scheduled announcements
- Custom command aliases
- Moderation shortcuts (e.g., "!spam" → mute + log)

---

## 8. Implementation Phases

### Phase 0: Foundation (Week 1-2)
- [ ] Set up Bun workspace with all package.json
- [ ] Configure TypeScript, ESLint, Prettier, Vitest
- [ ] Prisma schema (core: permits, guilds, users, config)
- [ ] Redis client + invalidation bus
- [ ] Cache package (L1 + L2)
- [ ] ConnectRPC setup + codegen
- [ ] Domain-core: Gateway, sharding, RPC server, health

### Phase 1: Built-in Domains - Security & Permits (Week 2-3)
- [ ] domain-permits (core + time-based + conditions)
- [ ] domain-security (verification, panic, antinuke, join-gate)
- [ ] domain-admin (module mgmt, config, /lumi panel)
- [ ] Permit panel with time/condition UI

### Phase 2: Built-in Domains - Features (Week 3-5)
- [ ] domain-tempvc
- [ ] domain-leveling (with image generation)
- [ ] domain-economy (with image generation)
- [ ] domain-filter
- [ ] domain-utility

### Phase 3: Module System & Toggleable Modules (Week 5-6)
- [ ] module-kit contracts
- [ ] module-runtime (discovery, load, lifecycle)
- [ ] downloader (addon install/update)
- [ ] Port modules: mod, logging, welcome, reactionroles, afk, onboarding, sticky, sheets

### Phase 4: Fleet Architecture (Week 6-8)
- [ ] Manager process (shard allocation, health, rolling deploy)
- [ ] Worker process (shard subset, fleet client)
- [ ] Fleet RPC (status, rebalance, health)
- [ ] Distributed scheduler (leader election)
- [ ] Cross-shard RPC (global leaderboards, economy sync)

### Phase 5: Sheet Planner (Week 8-9)
- [ ] domain-sheets (spreadsheet automation)

### Phase 6: Polish & Observability (Week 9-11)
- [ ] Full OpenTelemetry tracing
- [ ] Prometheus metrics + Grafana dashboards
- [ ] Integration tests (multi-process)
- [ ] Load testing (10k+ guilds)
- [ ] Documentation + migration guide

---

## 9. Migration Strategy

### 9.1 Database Migration
- New Prisma schema with all V1 + V2 tables
- Migration scripts for V1 data → V2 schema
- Permit data: direct mapping + new fields (expiresAt, conditions)
- Leveling/Economy: preserve balances, XP, inventories

### 9.2 Config Migration
- V1 config (JSON/DB) → V2 config (Prisma + validated schema)
- Tool: `lumi migrate config --from v1 --to v2`

### 9.3 Module Migration
- Bundled modules: rewrite to V2 module-kit format
- Addons: validation + reinstall via downloader

---

## 10. Key Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Runtime** | Bun | Native TS, fast, built-in test/runner, SQLite |
| **RPC** | ConnectRPC (protobuf) | Type-safe, browser + server, streaming, gRPC compatible |
| **Cache** | L1 (LRU Map) + L2 (Redis) | V1 pattern proven, devalue codec |
| **DB** | Prisma + PostgreSQL | Type-safe, migrations, V1 compatible |
| **Images** | Sharp + SVG (canvas fallback) | Fast, no headless Chrome needed |
| **Scheduler** | Redis-locked cron | Distributed, no single point of failure |
| **Sharding** | Discord.js built-in + custom allocator | Proven, manager controls allocation |
| **Logging** | Pino + OpenTelemetry | Structured, trace correlation |
| **Config** | Zod-validated env + DB | Runtime validation, hot-reload |

---

## 11. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Fleet complexity | High | Phase 4 only after core domains stable; extensive integration tests |
| Permit evaluation latency | Medium | Cache aggressively (5min), pre-compute chains, profile |
| Image generation load | Medium | Worker pool, queue, CDN caching, optional disable |
| Module breaking changes | High | Semver in manifest, compatibility layer for V1 addons |
| Data migration errors | High | Dry-run mode, rollback scripts, staging validation |

---

## 12. Success Criteria

- [ ] All V1 features ported + enhanced (permits, images, fleet)
- [ ] Multi-process fleet handles 50k+ guilds / 500k+ users
- [ ] P99 latency < 100ms for permit evaluation
- [ ] Zero-downtime deployments via rolling restart
- [ ] Sheet planner handles 1000+ rules/guild
- [ ] Full test coverage > 80% (unit + integration)
- [ ] Documentation complete for all domain packages

---

## 13. Next Steps

1. **Confirm phase priorities** - Any reordering?
2. **Set up development environment** - Nix flake, Docker Compose for Postgres/Redis
3. **Begin Phase 0** - Workspace, Prisma, RPC, Cache, Core
4. **Weekly sync** - Review progress, adjust scope

---

*This plan is a living document. Update as decisions are made during implementation.*