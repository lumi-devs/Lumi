# Skyra Discord Bot — Deep Architectural Analysis

**Repository**: `/home/rebiz/opt/workdir/.lumi-agents/research/repos/skyra`  
**Framework**: Sapphire Framework v5.3.3  
**Language**: TypeScript (ESM, Node 22+)  
**Database**: PostgreSQL (Prisma ORM) + InfluxDB (analytics) + Redis (not directly used, Dragonfly-compatible)  
**Architecture**: Sharded Discord.js client with worker threads for CPU-intensive tasks

---

## 1. High-Level Architecture

### 1.1 Entry Point & Bootstrap

```
src/Skyra.ts                           → Main entry, creates SkyraClient, initializes Sentry
src/lib/SkyraClient.ts                 → Extends SapphireClient, registers stores, workers, schedules
src/config.ts                          → Central configuration (CLIENT_OPTIONS, i18n, API, intents)
src/lib/setup/prisma.ts                → Prisma client with model extensions
```

**Key Initialization Sequence**:
1. `Skyra.ts` imports `#lib/setup` (side-effect: registers Prisma in container)
2. Creates `SkyraClient` extending `SapphireClient`
3. Constructor registers: `SerializerStore`, `TaskStore`, `WorkerManager`, `ScheduleManager`
4. `login()` starts workers, calls parent login, initializes schedules
5. `ready` listener prints banner, initializes recurring tasks (poststats, analytics sync)

### 1.2 Container & Dependency Injection

Uses Sapphire's `container` for global singleton access:
```typescript
// Registered in SkyraClient constructor
container.stores.register(new SerializerStore());
container.stores.register(new TaskStore());
container.workers = new WorkerManager();
container.schedule = this.schedules;
container.prisma = prisma;  // from setup/prisma.ts
```

---

## 2. Caching Architecture

### 2.1 Settings Cache (L1: In-Memory, L2: PostgreSQL)

**File**: `src/lib/database/settings/functions.ts`

```typescript
// L1: Collection<string, GuildData> — in-memory, per-guild settings
const cache = new Collection<string, GuildData>();

// Request deduplication: queue prevents duplicate DB fetches for same guild
const queue = new Collection<string, Promise<GuildData>>();

// Write serialization: AsyncQueue per guild ensures sequential writes
const locks = new Collection<string, AsyncQueue>();

// WeakSet tracks unpersisted (new) guild entries
const WeakMapNotInitialized = new WeakSet<ReadonlyGuildData>();
```

**Read Path**:
```typescript
export function readSettings(guild): Awaitable<ReadonlyGuildData> {
    const id = resolveGuildId(guild);
    return cache.get(id) ?? processFetch(id);  // L1 hit → return; else fetch
}

async function processFetch(id): Promise<ReadonlyGuildData> {
    const previous = queue.get(id);
    if (previous) return previous;  // deduplicate concurrent fetches
    const promise = fetch(id);
    queue.set(id, promise);
    const value = await promise;
    getSettingsContext(value);  // build derived structures (adders, permissions, regex)
    return value;
}
```

**Write Path** (Optimistic Locking via Transaction):
```typescript
export async function writeSettings(guild, data) {
    using trx = await writeSettingsTransaction(guild);  // acquires AsyncQueue lock
    if (typeof data === 'function') data = await data(trx.settings);
    await trx.write(data).submit();  // writes to Prisma, updates cache, releases lock
}
```

**Cache Invalidation**: `deleteSettingsCached(guild)` removes from `cache`, `locks`, and `SettingsContext` cache.

### 2.2 SettingsContext (Derived Computed Cache)

**File**: `src/lib/database/settings/context/SettingsContext.ts`

```typescript
export class SettingsContext {
    readonly #adders: AdderManager;              // Role/user permission adders
    readonly #permissionNodes: PermissionNodeManager;  // Permission tree
    #wordFilterRegExp: RegExp | null;            // Compiled self-mod filter regex
    #noMentionSpam: RateLimitManager;            // Mention spam rate limiter

    public update(settings, data) {
        this.#adders.onPatch(settings);
        if (permissions changed) this.#permissionNodes.refresh(settings);
        if (mention spam config changed) this.#noMentionSpam = new RateLimitManager(...);
        if (filter regex changed) recompile RegExp;
    }
}
```
- Cached per-guild in `Collection<Snowflake, SettingsContext>`
- Rebuilt on settings write via `updateSettingsContext()`
- Provides O(1) access to computed structures during message handling

### 2.3 Invite Store (TTL-Based Cache)

**File**: `src/lib/structures/InviteStore.ts`

```typescript
export class InviteStore extends Collection<string, InviteCodeEntry> {
    private readonly interval = setInterval(() => {
        const deleteAt = Date.now() - minutes(15);
        this.sweep((value) => value.fetchedAt < deleteAt);
    }, minutes(1)).unref();
}
```
- 15-minute TTL, swept every minute
- Stores valid/invalid state + guild ID
- Falls back to Discord API on miss

### 2.4 Analytics Buffer (InfluxDB Write API)

**File**: `src/lib/structures/AnalyticsData.ts`

```typescript
export class AnalyticsData {
    public readonly writeApi: WriteApi;  // Batched writes, 's' precision
    public messageCount = 0;             // In-memory counter
}
```
- Uses InfluxDB client's built-in batching (WriteApi)
- Flushes automatically; `messageCount` tracks local metrics

### 2.5 Discord.js Cache Configuration

**File**: `src/config.ts`

```typescript
makeCache: Options.cacheEverything(),
sweepers: {
    ...Options.DefaultSweeperSettings,
    messages: { interval: minutes.toSeconds(3), lifetime: minutes.toSeconds(15) }
}
```
- Full cache enabled (all entities)
- Custom message sweeper: 3-min interval, 15-min lifetime

---

## 3. Plugin/Module System (Sapphire Pieces)

### 3.1 Piece Stores

Sapphire's `Store<Piece>` subclasses manage all loadable units:

| Store | Purpose | Location |
|-------|---------|----------|
| `commands` | Slash + message commands | `src/commands/**/*.ts` |
| `listeners` | Discord event listeners | `src/listeners/**/*.ts` |
| `preconditions` | Command guards | `src/preconditions/*.ts` |
| `serializers` | Settings serializers | `SerializerStore` |
| `tasks` | Scheduled tasks | `TaskStore` |
| `arguments` | Custom arg parsers | `src/arguments/*.ts` |

**Registration** (in `SkyraClient` constructor):
```typescript
container.stores.register(new SerializerStore());
container.stores.register(new TaskStore());
```

### 3.2 Command Architecture

**Base**: `src/lib/structures/commands/SkyraCommand.ts` → extends `@sapphire/framework` `Command`

```typescript
export abstract class SkyraCommand extends Command<SkyraCommand.Args, SkyraCommand.Options> {
    public readonly guarded: boolean;           // Defer reply automatically
    public readonly hidden: boolean;            // Hide from help
    public readonly permissionLevel: PermissionLevels;  // 0-10

    public abstract messageRun(message, args, context): Awaitable<unknown>;
    
    // Custom pre-parse for message commands
    public override messagePreParse(message, parameters, context) {
        return implementSkyraCommandPreParse(this, message, parameters, context);
    }
}
```

**Subcommands**: `SkyraSubcommand.ts` uses `@sapphire/plugin-subcommands`

**Preconditions** (guards):
```typescript
// src/preconditions/*.ts
@ApplyOptions<Precondition.Options>({ name: 'BotOwner' })
export class UserPrecondition extends Precondition {
    public run() { return this.container.client.isOwner(message.author); }
}
```
Applied via `@Precondition('BotOwner')` decorator on commands.

### 3.3 Listener Architecture

**Base**: `src/lib/structures/listeners/ShardListener.ts` → abstract shard-aware listener

```typescript
export abstract class ShardListener extends Listener {
    protected abstract readonly title: string;
    protected header(shardId): string {
        return `${bold(magenta(`[SHARD ${shardId}]`))} ${this.title}`;
    }
}
```

**Error Handling**: `src/listeners/errors/listenerError.ts`
```typescript
public run(error, context) {
    if (error instanceof UserError) return;  // Ignore expected user errors
    this.container.logger.fatal(`[EVENT] ${context.piece.name}\n${error.stack}`);
}
```

### 3.4 Task/Schedule System

**Store**: `src/lib/schedule/structures/TaskStore.ts` → `Store<Task>`

**Task Definition**:
```typescript
// src/lib/schedule/structures/Task.ts
export abstract class Task extends Piece {
    public abstract run(data: unknown): Awaitable<PartialResponseValue | null>;
}
```

**Schedule Manager**: `src/lib/schedule/manager/ScheduleManager.ts`

```typescript
export class ScheduleManager {
    public queue: ScheduleEntry[] = [];  // Sorted by execution time
    private interval: NodeJS.Timeout | null = null;

    public async init() {
        const entries = await container.prisma.schedule.findMany();
        for (const entry of entries) this._insert(new ScheduleEntry(entry));
        this._checkInterval();
    }

    public async execute() {
        const now = Date.now();
        const execute: Promise<ResponseValue>[] = [];
        for (const entry of this.queue) {
            if (entry.time.getTime() > now) break;
            execute.push(entry.run());  // Runs Task piece
        }
        await this._handleResponses(await Promise.all(execute));
        this._checkInterval();  // Reset interval to next task
    }
}
```

**ScheduleEntry** wraps Prisma `Schedule` model + Task piece:
- Supports one-time, recurring (cron), and catch-up
- Response types: `Ignore`, `Finished`, `Delay(ms)`, `Update(new Date)`
- Persisted to PostgreSQL; loaded at startup

**Built-in Tasks** (from `src/tasks/`):
- `poststats` — every 10 min (`*/10 * * * *`)
- `syncResourceAnalytics` — every minute (`*/1 * * * *`)
- `reminder` — user reminders

---

## 4. Database & ORM Patterns

### 4.1 Prisma Schema (PostgreSQL)

**File**: `prisma/schema.prisma`

**Models**:
| Model | Purpose | Key Fields |
|-------|---------|------------|
| `Guild` | Per-guild settings (200+ fields) | `id`, `prefix`, `language`, JSON columns for complex settings |
| `User` | User preferences | `id`, `moderationDM` |
| `Moderation` | Moderation cases | Composite PK `(caseId, guildId)`, `type`, `duration`, `extraData` (JSON) |
| `Schedule` | Scheduled tasks | `taskId`, `time`, `recurring` (cron), `catchUp`, `data` (JSON) |
| `TwitchSubscription` | Twitch webhook subscriptions | `streamerId`, `subscriptionId`, `subscriptionType` |
| `GuildSubscription` | Guild ↔ Twitch mapping | Composite PK, FK to `TwitchSubscription` |
| `Migration` | Custom migration tracking | `timestamp`, `name` |

**JSON Columns** (heavily used for flexible settings):
- `permissionsUsers`, `permissionsRoles` → `PermissionNodeEntry[]`
- `commandAutoDelete` → `CommandAutoDeleteEntry[]`
- `disabledCommandsChannels` → `DisabledCommandChannelEntry[]`
- `stickyRoles`, `reactionRoles`, `rolesUniqueRoleSets`
- `moderation.extraData`, `schedule.data`

**Prisma Extensions** (`src/lib/setup/prisma.ts`):
```typescript
const prisma = new PrismaClient().$extends({
    name: 'extensions',
    model: {
        user: {
            async fetchModerationDirectMessageEnabled(userId) { ... },
            async toggleModerationDirectMessageEnabled(userId) { ... }
        },
        moderation: {
            async getGuildModerationMetadata(guildId) { ... }  // Raw SQL for perf
        }
    }
});
```

### 4.2 Settings Read/Write Pattern

**Read** (with caching):
```typescript
// src/lib/database/settings/functions.ts
export function readSettings(guild): Awaitable<ReadonlyGuildData> {
    const id = resolveGuildId(guild);
    return cache.get(id) ?? processFetch(id);
}
```

**Write** (transactional, with lock):
```typescript
export async function writeSettings(guild, data) {
    using trx = await writeSettingsTransaction(guild);  // AsyncQueue lock
    if (typeof data === 'function') data = await data(trx.settings);
    await trx.write(data).submit();  // Prisma create/update + cache update
}
```

**Transaction Class** (implements `Disposable`):
```typescript
export class Transaction {
    #changes = Object.create(null) as Partial<ReadonlyGuildData>;
    public write(data) { Object.assign(this.#changes, data); return this; }
    public async submit() {
        if (WeakMapNotInitialized.has(this.settings)) {
            await container.prisma.guild.create({ data: { ...this.settings, ...this.#changes } });
        } else {
            await container.prisma.guild.update({ where: { id: this.settings.id }, data: this.#changes });
        }
        Object.assign(this.settings, this.#changes);
        updateSettingsContext(this.settings, this.#changes);
    }
}
```

### 4.3 InfluxDB (Analytics)

**File**: `src/lib/structures/AnalyticsData.ts`
```typescript
export class AnalyticsData {
    public readonly influx: InfluxDB = new InfluxDB(parseAnalytics());
    public readonly writeApi: WriteApi = this.influx.getWriteApi(org, bucket, 's');
    public readonly queryApi: QueryApi = this.influx.getQueryApi(org);
}
```
- Write API: batched, second precision
- Used for: command usage, guild/user counts, resource analytics

---

## 5. Sharding & Concurrency

### 5.1 Sharding Configuration

**File**: `src/config.ts` → `CLIENT_OPTIONS` passed to `SapphireClient`

```typescript
// SapphireClient handles sharding via discord.js ShardingManager
// SkyraClient extends SapphireClient
```

**Shard Listeners** (`src/listeners/shard/*.ts`):
- `shardReady.ts` — logs ready with unavailable guild count
- `shardDisconnect.ts`, `shardReconnecting.ts`, `shardResume.ts`, `shardError.ts`

### 5.2 Worker Threads (CPU Offloading)

**File**: `src/lib/moderation/workers/WorkerManager.ts`

```typescript
export class WorkerManager {
    public readonly workers: WorkerHandler[] = [];
    public constructor(count = envParseInteger('WORKER_COUNT', cpus().length)) {
        for (let i = 0; i < count; ++i) this.workers.push(new WorkerHandler());
    }
    public send(data, delay?) { return this.getIdealWorker().send(data, delay); }
    private getIdealWorker() { 
        return this.workers.reduce((best, w) => best.remaining > w.remaining ? w : best); 
    }
}
```

**Worker Handler**: `src/lib/moderation/workers/WorkerHandler.ts`
- Spawns `worker.mjs` via `node:worker_threads`
- `AsyncQueue` for request/response per worker
- Heartbeat every 45s; auto-restart on exit

**Worker Script**: `src/lib/moderation/workers/worker.mjs`
```javascript
// Runs in separate thread, handles CPU-intensive regex filtering
const IncomingType = { RunRegExp: 0 };
parentPort.on('message', (message) => post(handleMessage(message)));

function handleRunRegExp(message) {
    // Removes confusables, runs regex, returns filtered + highlighted
}
```
- Used for: automod word/link/invite/reaction filtering (heavy regex)
- Offloads from main event loop

### 5.3 Guild Member Fetch Queue

**File**: `src/lib/discord/GuildMemberFetchQueue.ts` (referenced in SkyraClient)

```typescript
public override readonly guildMemberFetchQueue = new GuildMemberFetchQueue();
```
- Batches guild member fetches to respect rate limits
- Used on guild create / large guild chunking

---

## 6. Web Dashboard / API Routes

### 6.1 API Plugin

**Dependency**: `@sapphire/plugin-api` v8.0.0

**Configuration** (`src/config.ts`):
```typescript
function parseApi(): ServerOptions | undefined { ... }
function parseApiAuth(): ServerOptionsAuth | undefined { ... }
export const CLIENT_OPTIONS: ClientOptions = { api: parseApi(), ... };
```

### 6.2 Route Structure

**Directory**: `src/routes/` (file-based routing)

| Route | Purpose |
|-------|---------|
| `index.get.ts` | Health check |
| `commands.get.ts` | List commands |
| `languages.get.ts` | Available languages |
| `guilds/[guild]/settings.get.ts` | Get guild settings |
| `guilds/[guild]/settings.patch.ts` | Update guild settings |
| `guilds/[guild]/channels.get.ts` | List channels |
| `guilds/[guild]/roles.get.ts` | List roles |
| `guilds/[guild]/members/[member].get.ts` | Get member |
| `oauth/user.post.ts` | OAuth callback |
| `users/@me.get.ts` | Current user |
| `twitch/event_sub_verify.post.ts` | Twitch webhook verification |

### 6.3 Authentication & Authorization

**File**: `src/lib/api/utils.ts`

```typescript
export const authenticated = () => createFunctionPrecondition(
    (request) => Boolean(request.auth?.token),
    (_, response) => response.error(HttpCodes.Unauthorized)
);

export function ratelimit(time, limit = 1, auth = false) {
    const manager = new RateLimitManager(time, limit);
    return createFunctionPrecondition(
        (request, response) => {
            const id = auth ? request.auth!.id : request.headers['x-forwarded-for'];
            const bucket = manager.acquire(id);
            if (bucket.limited) { response.setHeader('Retry-After', ...); return false; }
            bucket.consume();
            return true;
        },
        (_, response) => response.error(HttpCodes.TooManyRequests)
    );
}

export async function canManage(guild, member): Promise<boolean> {
    if (guild.ownerId === member.id) return true;
    const settings = await readSettings(guild);
    const nodes = readSettingsPermissionNodes(settings);
    return isAdmin(member, settings.rolesAdmin) && nodes.run(member, ...);
}
```

**Route Usage**:
```typescript
// src/routes/guilds/[guild]/settings.get.ts
@authenticated()
@ratelimit(seconds(5), 2, true)
public async run(request, response) {
    const guild = this.container.client.guilds.cache.get(request.params.guild);
    const member = await guild.members.fetch(request.auth!.id);
    if (!(await canManage(guild, member))) return response.error(HttpCodes.Forbidden);
    const settings = await readSettings(guild);
    return this.sendSettings(response, settings);
}
```

### 6.4 OAuth Flow

- `@sapphire/plugin-api` handles Discord OAuth2
- `transformOauthGuildsAndUser` enriches guilds with `manageable` flag (checks perms)
- Session stored via plugin-api's auth system

---

## 7. Moderation System Architecture

### 7.1 Moderation Manager

**File**: `src/lib/moderation/managers/ModerationManager.ts`
- Central coordinator for moderation actions
- Handles case creation, DM sending, role application, logging

### 7.2 Actions (Command Pattern)

**Directory**: `src/lib/moderation/actions/`

```
ModerationAction (abstract base)
├── RoleModerationAction (base for role changes)
│   ├── ModerationActionRoleAdd
│   └── ModerationActionRoleRemove
├── ModerationActionBan
├── ModerationActionKick
├── ModerationActionTimeout
├── ModerationActionWarning
├── ModerationActionSoftBan
├── ModerationActionVoiceKick
├── ModerationActionVoiceMute
└── ModerationActionRestricted* (Attachment, Embed, Emoji, Reaction, Voice)
```

Each action implements `execute(entry, context)`.

### 7.3 Workers Integration

Heavy regex filtering (automod) offloaded to worker threads:
- `WorkerManager` → pool of `WorkerHandler` → `worker.mjs`
- `IncomingType.RunRegExp` → filters message content
- Returns `filtered` + `highlighted` content

### 7.4 Schedule Integration

Moderation expirations (timeout, mute, ban) use `ScheduleManager`:
- `ScheduleEntry` with `taskId: 'moderationEnd*'` 
- On execution, runs corresponding `ModerationAction` to revert

---

## 8. Internationalization (i18n)

**Dependency**: `@sapphire/plugin-i18next` v7.1.3

**Configuration** (`src/config.ts`):
```typescript
function parseInternationalizationOptions(): InternationalizationOptions {
    return {
        defaultLanguageDirectory: LANGUAGE_ROOT,  // dist/languages
        fetchLanguage: async ({ guild }) => guild ? (await readSettings(guild)).language : 'en-US',
        formatters: [...],  // Custom: DateTime, Permissions, HumanLevels, etc.
        i18next: (_, languages) => ({
            supportedLngs: languages,
            preload: languages,
            fallbackLng: { 'es-419': ['es-ES', 'en-US'], default: ['en-US'] }
        })
    };
}
```

**Language Files**: `src/languages/` → compiled to `dist/languages/`
- Namespaced: `globals`, `commands/*`, `events/*`, `settings/*`

---

## 9. Key Design Patterns Summary

| Pattern | Implementation |
|---------|----------------|
| **L1/L2 Cache** | `Collection` + `AsyncQueue` locks + Prisma |
| **Derived Cache** | `SettingsContext` rebuilt on write |
| **Write Serialization** | Per-guild `AsyncQueue` (mutex) |
| **Request Deduplication** | `queue` Collection for concurrent fetches |
| **Piece-Based Modules** | Sapphire `Store<Piece>` for commands, listeners, tasks |
| **Worker Offloading** | `worker_threads` pool with `AsyncQueue` per worker |
| **Scheduled Tasks** | Prisma-persisted `ScheduleEntry` + in-memory priority queue |
| **Rate Limiting** | `@sapphire/ratelimits` `RateLimitManager` (API + mention spam) |
| **Dependency Injection** | Sapphire `container` singletons |
| **Configuration** | Central `config.ts` with env parsing, exports `CLIENT_OPTIONS` |
| **Error Handling** | Sentry + custom listeners (`ListenerError`, `TaskError`) |
| **Database** | Prisma with JSON columns for flexible settings, raw SQL for analytics |

---

## 10. Infrastructure (Docker Compose)

```yaml
services:
  postgres:    # PostgreSQL 15, port 5432
  influx:      # InfluxDB 2.7, port 8285
  redis:       # Redis (Dragonfly-compatible), port 8287
  skyra:       # Bot container, depends on postgres + influx
```

---

## 11. Notable Files Reference

| File | Purpose |
|------|---------|
| `src/Skyra.ts` | Entry point |
| `src/lib/SkyraClient.ts` | Client extension, store registration |
| `src/config.ts` | All configuration, intents, i18n, API |
| `src/lib/setup/prisma.ts` | Prisma client + extensions |
| `src/lib/database/settings/functions.ts` | Settings cache + transaction logic |
| `src/lib/database/settings/context/SettingsContext.ts` | Derived settings cache |
| `src/lib/schedule/manager/ScheduleManager.ts` | Task scheduler |
| `src/lib/moderation/workers/WorkerManager.ts` | Worker thread pool |
| `src/lib/api/utils.ts` | API auth, ratelimit, permissions |
| `src/routes/**/*.ts` | REST API endpoints |
| `prisma/schema.prisma` | Database schema |

---

## 12. Conclusions for Lumi-v2 Integration

**Strengths to Adopt**:
1. **Per-guild settings cache with AsyncQueue locks** — solves concurrent write conflicts elegantly
2. **SettingsContext derived cache** — O(1) permission/regex lookups during message processing
3. **Worker thread pool for CPU-heavy tasks** — keeps main event loop responsive
4. **ScheduleManager with Prisma persistence** — survives restarts, supports cron + catch-up
5. **Sapphire Piece system** — clean separation of commands, listeners, tasks, preconditions
6. **File-based API routing with decorator auth/ratelimit** — declarative, maintainable

**Patterns to Adapt**:
- Replace custom stores with Sapphire `Store<Piece>` equivalents
- Use `AsyncQueue` per-entity for write serialization
- Offload expensive operations (AI, regex, image processing) to worker threads
- Persist scheduled tasks to database with in-memory priority queue
- Centralize config in single `config.ts` with env validation

**Integration Points**:
- Skyra's `container.prisma` → Lumi's database layer
- Skyra's `container.schedule` → Lumi's task scheduler
- Skyra's `WorkerManager` → Lumi's background job processor
- Skyra's API routes → Lumi's dashboard RPC endpoints