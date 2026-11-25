# Skyra Deep Architectural Audit

## Executive Summary

Skyra is a sophisticated Discord bot built on **Sapphire Framework** (TypeScript) with a Bun monorepo structure. It demonstrates production-grade patterns for:
- **Worker thread pools** for CPU-intensive tasks (regex filtering, confusables removal)
- **Per-guild serialization** via `@sapphire/async-queue` for settings writes
- **Derived cache with automatic invalidation** (`SettingsContext`)
- **Piece-based architecture** (commands, listeners, tasks, serializers) with hot-reload via Sapphire
- **Persistent scheduling** with Prisma-backed `ScheduleManager`
- **Type-safe configuration** with validation via `SchemaKey`/`SchemaGroup`

---

## 1. Worker Thread Pool for CPU-Heavy Tasks

### Files
- `src/lib/moderation/workers/WorkerManager.ts`
- `src/lib/moderation/workers/WorkerHandler.ts`
- `src/lib/moderation/workers/worker.mjs`
- `src/lib/moderation/workers/types.ts`

### Architecture

```typescript
// WorkerManager.ts - Creates pool based on CPU cores
export class WorkerManager {
  public readonly workers: WorkerHandler[] = [];

  public constructor(count = envParseInteger('WORKER_COUNT', cpus().length)) {
    for (let i = 0; i < count; ++i) {
      this.workers.push(new WorkerHandler());
    }
  }

  public send(data: NoId<IncomingPayload>, delay?: number | null) {
    return this.getIdealWorker().send(data, delay);
  }

  private getIdealWorker() {
    // Least-loaded worker selection
    return this.workers.reduce((best, worker) => 
      best.remaining > worker.remaining ? worker : best
    );
  }
}
```

```typescript
// WorkerHandler.ts - Each worker wraps a Node.js Worker thread
export class WorkerHandler {
  private worker!: Worker;
  private queue = new AsyncQueue(); // Serializes sends per worker
  private response = new WorkerResponseHandler();

  public async send(data: NoId<IncomingPayload>, delay: number | null = null) {
    await this.queue.wait(); // Backpressure
    try {
      const id = this.generateId();
      this.worker.postMessage({ id, ...data });
      return await this.response.waitFor(id, delay);
    } finally {
      this.queue.shift();
    }
  }

  private spawn() {
    this.worker = new Worker(WorkerHandler.filename, { 
      execArgv: [], 
      env: SHARE_ENV 
    });
    this.worker.on('message', this.handleMessage.bind(this));
  }
}
```

```javascript
// worker.mjs - Runs in separate thread, handles CPU-heavy regex filtering
import { remove as removeConfusables } from 'confusables';
import { isMainThread, parentPort } from 'node:worker_threads';

parentPort.on('message', (message) => post(handleMessage(message)));

function handleRunRegExp(message) {
  // Remove confusables (homoglyph attacks) then run regex
  const result = filter(removeConfusables(message.content), message.regExp);
  // Returns { filtered: "***", highlighted: "__match__" }
}
```

### Key Patterns
| Pattern | Implementation |
|---------|----------------|
| **Pool sizing** | `cpus().length` default, configurable via `WORKER_COUNT` env |
| **Load balancing** | Least-remaining-tasks selection (`getIdealWorker`) |
| **Backpressure** | `@sapphire/async-queue` per worker serializes requests |
| **Heartbeat** | 45s interval `OutgoingType.Heartbeat` detects stale workers |
| **Auto-restart** | `handleExit` spawns replacement on crash |
| **CPU work** | Regex filtering + `confusables` homoglyph removal |

### Use Cases in Skyra
- **AutoModeration word filter**: Runs user-defined regex against messages after confusables removal
- **Image generation** (referenced in eval.ts imports): Could extend for Canvas/Sharp work

---

## 2. AsyncQueue for Per-Guild/Per-Channel Serialization

### Files
- `src/lib/database/settings/functions.ts` (primary)
- `src/lib/moderation/managers/ModerationManager.ts` (save queue)
- `src/lib/discord/GuildMemberFetchQueue.ts` (rate-limited fetching)

### Settings Write Serialization (`functions.ts`)

```typescript
// Three-tier locking system
const cache = new Collection<string, GuildData>();           // Hot cache
const queue = new Collection<string, Promise<GuildData>>();  // In-flight fetches
const locks = new Collection<string, AsyncQueue>();          // Per-guild write locks

export async function writeSettingsTransaction(guild: GuildResolvable) {
  const id = resolveGuildId(guild);
  const queue = locks.ensure(id, () => new AsyncQueue()); // Per-guild lock
  
  await queue.wait(); // Acquire exclusive write lock
  
  const settings = cache.get(id) ?? (await unlockOnThrow(processFetch(id), queue));
  return new Transaction(settings, queue);
}

export class Transaction {
  constructor(public readonly settings: ReadonlyGuildData, private readonly queue: AsyncQueue) {}
  
  public async submit() {
    // ... write to Prisma ...
    updateSettingsContext(this.settings, this.#changes); // Invalidate derived cache
    this.queue.shift(); // Release lock
  }
}
```

### Moderation Save Queue (`ModerationManager.ts`)

```typescript
export class ModerationManager {
  // Prevents case_id duplication under concurrent moderation actions
  readonly #saveQueue = new AsyncQueue();
  
  public async createEntry(data) {
    await this.#saveQueue.wait();
    try {
      return await this._createEntry(data);
    } finally {
      this.#saveQueue.shift();
    }
  }
}
```

### Guild Member Fetch Queue (`GuildMemberFetchQueue.ts`)

```typescript
export class GuildMemberFetchQueue {
  private readonly shards = new Map<number, GuildMemberFetchQueueShardEntry>();
  
  public add(shardId: number, guildId: string) {
    // Per-shard queue with 90 queries/minute rate limit
    const entry = this.shards.get(shardId) ?? { pending: [], fetching: 0 };
    entry.pending.push(guildId);
  }
  
  public fetch() {
    for (const entry of this.shards.values()) this.fetchShard(entry);
  }
  
  private async fetchShard(entry) {
    // Processes up to 100 guilds per minute per shard
    const guilds = entry.pending.splice(0, 100);
    await Promise.all(guilds.map(g => this.fetchGuildMembers(g)));
  }
}
```

### Key Patterns
| Pattern | Implementation |
|---------|----------------|
| **Per-guild locks** | `locks.ensure(guildId, () => new AsyncQueue())` |
| **Lock acquisition** | `await queue.wait()` / `queue.shift()` |
| **Deadlock prevention** | `using trx = await writeSettingsTransaction(...)` with `Symbol.dispose` |
| **Fetch deduplication** | `queue` Collection caches in-flight Prisma fetches |
| **Rate limiting** | Token bucket per shard (90 req/min Discord limit) |

---

## 3. SettingsContext: Derived Cache with Automatic Invalidation

### Files
- `src/lib/database/settings/context/SettingsContext.ts`
- `src/lib/database/settings/context/functions.ts`
- `src/lib/database/settings/functions.ts` (lines 134-136, 183)

### Architecture

```typescript
// SettingsContext.ts - Derived/computed values cached per guild
export class SettingsContext {
  readonly #adders: AdderManager;
  readonly #permissionNodes: PermissionNodeManager;
  #wordFilterRegExp: RegExp | null;
  #noMentionSpam: RateLimitManager;

  public constructor(settings: ReadonlyGuildData) {
    // Expensive computations done ONCE at construction
    this.#adders = new AdderManager(settings);
    this.#permissionNodes = new PermissionNodeManager(settings);
    this.#wordFilterRegExp = isNullishOrEmpty(settings.selfmodFilterRaw) 
      ? null 
      : new RegExp(create(settings.selfmodFilterRaw), 'gi');
    this.#noMentionSpam = new RateLimitManager(
      settings.noMentionSpamTimePeriod * 1000, 
      settings.noMentionSpamMentionsAllowed
    );
  }

  // Incremental updates - only recompute what changed
  public update(settings: ReadonlyGuildData, data: Partial<ReadonlyGuildData>) {
    this.#adders.onPatch(settings);
    
    if (!isNullish(data.permissionsRoles) || !isNullish(data.permissionsUsers)) {
      this.#permissionNodes.refresh(settings);
    }
    
    if (!isNullish(data.noMentionSpamTimePeriod) || !isNullish(data.noMentionSpamMentionsAllowed)) {
      this.#noMentionSpam = new RateLimitManager(
        settings.noMentionSpamTimePeriod * 1000, 
        settings.noMentionSpamMentionsAllowed
      );
    }
    
    if (!isNullish(data.selfmodFilterRaw)) {
      this.#wordFilterRegExp = isNullishOrEmpty(settings.selfmodFilterRaw) 
        ? null 
        : new RegExp(create(settings.selfmodFilterRaw), 'gi');
    }
  }
}
```

```typescript
// functions.ts - Cache management
const cache = new Collection<Snowflake, SettingsContext>();

export function getSettingsContext(settings: ReadonlyGuildData): SettingsContext {
  return cache.ensure(settings.id, () => new SettingsContext(settings));
}

export function updateSettingsContext(settings: ReadonlyGuildData, data: Partial<ReadonlyGuildData>): void {
  const existing = cache.get(settings.id);
  if (existing) {
    existing.update(settings, data); // Incremental invalidation
  } else {
    cache.set(settings.id, new SettingsContext(settings));
  }
}

export function deleteSettingsContext(guildId: Snowflake) {
  cache.delete(guildId); // Full eviction on guild leave
}
```

### Invalidation Trigger Points

| Trigger | File | Line |
|---------|------|------|
| Settings write commit | `functions.ts` | 136: `updateSettingsContext(this.settings, this.#changes)` |
| Settings fetch (cold) | `functions.ts` | 183: `getSettingsContext(value)` |
| Guild leave/cache clear | `functions.ts` | 35: `deleteSettingsContext(id)` |

### Derived Values Cached
| Computed Value | Source Fields | Invalidation Condition |
|----------------|---------------|------------------------|
| `AdderManager` | permission adders | Any settings change (`onPatch`) |
| `PermissionNodeManager` | `permissionsRoles`, `permissionsUsers` | Role/user permission changes |
| `wordFilterRegExp` | `selfmodFilterRaw` | Filter regex changes |
| `noMentionSpam` (RateLimitManager) | `noMentionSpamTimePeriod`, `noMentionSpamMentionsAllowed` | Mention spam config changes |

---

## 4. Piece Lifecycle and Hot-Reload

### Files
- `src/lib/structures/commands/SkyraCommand.ts`
- `src/lib/schedule/structures/Task.ts` / `TaskStore.ts`
- `src/lib/database/settings/structures/SerializerStore.ts`
- `src/lib/SkyraClient.ts` (store registration)
- `src/lib/util/functions/pieces.ts` (logging utilities)

### Sapphire Piece Architecture

Skyra uses **`@sapphire/pieces`** (via `@sapphire/framework`) for all extensible components:

```typescript
// SkyraClient.ts - Store registration at startup
export class SkyraClient extends SapphireClient {
  public constructor() {
    super(CLIENT_OPTIONS);
    
    // Custom stores
    container.stores.register(new SerializerStore());
    container.stores.register(new TaskStore());
    
    container.workers = new WorkerManager();
    this.schedules = new ScheduleManager();
    container.schedule = this.schedules;
  }
}
```

```typescript
// TaskStore.ts - Extends Sapphire Store<Piece>
export class TaskStore extends Store<Task, 'tasks'> {
  public constructor() {
    super(Task, { name: 'tasks' });
  }
}

// Task.ts - Abstract base piece
export abstract class Task extends Piece {
  public abstract run(data: unknown): Awaitable<PartialResponseValue | null>;
}
```

```typescript
// SkyraCommand.ts - Command piece with permissions/preconditions
export abstract class SkyraCommand extends Command<SkyraCommand.Args, SkyraCommand.Options> {
  public readonly guarded: boolean;
  public readonly hidden: boolean;
  public readonly permissionLevel: PermissionLevels;
  
  public constructor(context: Command.LoaderContext, options: SkyraCommand.Options) {
    super(context, { ...SkyraCommandConstructorDefaults, ...options });
    this.guarded = options.guarded ?? SkyraCommandConstructorDefaults.guarded;
    this.hidden = options.hidden ?? SkyraCommandConstructorDefaults.hidden;
    this.permissionLevel = options.permissionLevel ?? SkyraCommandConstructorDefaults.permissionLevel;
  }
  
  public abstract override messageRun(message: Message, args: SkyraCommand.Args, context: MessageCommand.RunContext): Awaitable<unknown>;
}
```

### Piece Types in Skyra

| Store Name | Base Class | Location | Hot-Reload |
|------------|------------|----------|------------|
| `commands` | `SkyraCommand` | `src/commands/**/*.ts` | ✅ Sapphire native |
| `listeners` | `Listener` | `src/listeners/**/*.ts` | ✅ Sapphire native |
| `tasks` | `Task` | `src/tasks/*.ts` | ✅ Sapphire native |
| `serializers` | `Serializer` | `src/serializers/*.ts` | ✅ Via `SerializerStore` |
| `arguments` | `Argument` | `src/arguments/*.ts` | ✅ Sapphire native |
| `preconditions` | `Precondition` | `src/preconditions/*.ts` | ✅ Sapphire native |

### Hot-Reload Mechanism (Sapphire Framework)

Sapphire's `Store` class provides:
- **`store.load(path)`** - Load single piece
- **`store.unload(piece)`** - Unload piece
- **`store.reload(piece)`** - Atomic reload (unload → load)
- **`@sapphire/plugin-watcher`** - File watcher for dev mode (auto-reload)

```typescript
// Typical dev workflow (from Sapphire docs)
// pieces are automatically reloaded on file change in development
// Production: manual `store.reload(piece)` via admin command
```

### Logging Prefix Utility

```typescript
// pieces.ts - Structured logging for pieces
export function getLogPrefix(piece: Piece | string) {
  return bgBlue(piece instanceof Piece ? `[ ${piece.store.name} => ${piece.name} ]` : `[ ${piece} ]`);
}
```

Output: `[ commands => ban ]`, `[ tasks => poststats ]`

---

## 5. ScheduleManager with Prisma Persistence

### Files
- `src/lib/schedule/manager/ScheduleManager.ts`
- `src/lib/schedule/manager/ScheduleEntry.ts`
- `src/lib/schedule/structures/Task.ts`
- `prisma/schema.prisma` (Schedule model)

### Prisma Schema

```prisma
// prisma/schema.prisma
model Schedule {
  id        Int      @id @default(autoincrement())
  taskId    String   @map("task_id") @db.VarChar
  time      DateTime @db.Timestamp(6)
  recurring String?  @db.VarChar
  catchUp   Boolean  @default(true) @map("catch_up")
  data      Json
  @@map("schedule")
}
```

### ScheduleManager

```typescript
export class ScheduleManager {
  public queue: ScheduleEntry[] = []; // Sorted by time (earliest first)
  private interval: NodeJS.Timeout | null = null;

  public async init() {
    // Load all persisted tasks on startup
    const entries = await container.prisma.schedule.findMany();
    for (const entry of entries) this._insert(new ScheduleEntry(entry));
    this._checkInterval();
  }

  public async add<Type extends ScheduleEntry.TaskId>(
    taskId: Type,
    timeResolvable: TimeResolvable,
    options: ScheduleManagerAddOptions<Type>
  ) {
    // Validate task exists in store
    if (!container.stores.get('tasks').has(taskId)) throw new Error(...);
    
    const [time, cron] = this._resolveTime(timeResolvable);
    const entry = await ScheduleEntry.create({
      taskId, time, recurring: cron?.cron ?? null,
      catchUp: options.catchUp ?? true, data: options.data
    });
    
    this._insert(entry); // Insert sorted by time
    this._checkInterval();
    return entry;
  }

  public async execute() {
    const now = Date.now();
    const execute: Promise<ResponseValue>[] = [];
    
    // Process all due tasks (queue is pre-sorted)
    for (const entry of this.queue) {
      if (entry.time.getTime() > now) break;
      execute.push(entry.run());
    }
    
    if (!execute.length) return;
    await this._handleResponses(await Promise.all(execute));
    this._checkInterval();
  }

  private _checkInterval(): void {
    if (!this.queue.length) this._clearInterval();
    else if (!this.interval) 
      this.interval = setInterval(this.execute.bind(this), 5000).unref();
  }
}
```

### ScheduleEntry (Persisted Task Instance)

```typescript
export class ScheduleEntry<Type extends TaskId = TaskId> {
  public id: number;
  public taskId: string;
  public time!: Date;
  public recurring!: Cron | null;
  public catchUp!: boolean;
  public data!: TaskData[Type];

  // Pause/resume for safe rescheduling
  public pause() { this.#paused = true; }
  public resume() { this.#paused = false; }

  public async run(): Promise<ResponseValue> {
    const { task } = this;
    if (!task?.enabled || this.#running || this.#paused) 
      return { entry: this, type: ResponseType.Ignore };

    this.#running = true;
    let response: PartialResponseValue | null = null;
    try {
      response = await task.run({ ...this.data, id: this.id });
    } catch (error) {
      container.client.emit(Events.TaskError, error, { piece: task, entity: this });
    }
    this.#running = false;

    if (response !== null) return { ...response, entry: this };

    // Auto-reschedule recurring tasks
    return this.recurring
      ? { entry: this, type: ResponseType.Update, value: this.recurring.next() }
      : { entry: this, type: ResponseType.Finished };
  }

  public async update(data: UpdateData<Type>) {
    const entry = await container.prisma.schedule.update({ where: { id: this.id }, data });
    this.#patch(entry); // Sync local state
  }
}
```

### Response Types (Task Control Flow)

```typescript
export const enum ResponseType {
  Ignore,    // Task not run (disabled/paused/running) - re-check next interval
  Delay,     // Reschedule: entry.time + value (ms)
  Update,    // Reschedule: exact new time (Date)
  Finished   // Remove from DB and queue
}
```

### Built-in Tasks

```typescript
// ScheduleEntry.ts namespace
export namespace ScheduleEntry {
  export interface TaskData {
    poststats: null;                    // Posts server count to listing sites
    syncResourceAnalytics: null;        // Syncs analytics to InfluxDB
    moderationEndAddRole: ModerationTaskData<RoleAdd>;
    moderationEndBan: ModerationTaskData<Ban>;
    moderationEndMute: ModerationTaskData<Mute>;
    moderationEndRemoveRole: ModerationTaskData<RoleRemove>;
    moderationEndRestrictionAttachment: ModerationTaskData<RestrictedAttachment>;
    moderationEndRestrictionEmbed: ModerationTaskData<RestrictedEmbed>;
    moderationEndRestrictionEmoji: ModerationTaskData<RestrictedEmoji>;
    moderationEndRestrictionReaction: ModerationTaskData<RestrictedReaction>;
    moderationEndRestrictionVoice: ModerationTaskData<RestrictedVoice>;
    moderationEndSetNickname: ModerationTaskData<SetNickname>;
    moderationEndTimeout: ModerationTaskData<Timeout>;
    moderationEndVoiceMute: ModerationTaskData<VoiceMute>;
    moderationEndWarning: ModerationTaskData<Warning>;
  }
}
```

### Initialization (Ready Listener)

```typescript
// listeners/ready.ts
private async initPostStatsTask() {
  const { queue } = this.container.schedule;
  if (!queue.some((task) => task.taskId === Schedules.Poststats)) {
    await this.container.schedule.add(Schedules.Poststats, '*/10 * * * *', { data: null });
  }
}
```

---

## 6. Type-Safe Configuration with Validation

### Files
- `src/lib/database/settings/configuration.ts`
- `src/lib/database/settings/schema/SchemaKey.ts`
- `src/lib/database/settings/schema/SchemaGroup.ts`
- `src/lib/database/settings/structures/Serializer.ts`
- `src/serializers/*.ts` (30+ serializers)

### Configuration Definition

```typescript
// configuration.ts - 1000+ lines defining every guild setting
let cachedConfiguration: Record<SchemaDataKey, SchemaKey> | null = null;

export function getConfiguration() {
  cachedConfiguration ??= makeKeys({
    // Example: Prefix setting
    prefix: {
      type: 'string',
      default: process.env.CLIENT_PREFIX ?? '!',
      minimum: 1,
      maximum: 10,
    },
    
    // Example: Role array with custom serializer
    rolesAdmin: {
      type: 'role',
      array: true,
      default: [],
    },
    
    // Example: Numeric with range validation
    selfmodMessagesMaximum: {
      type: 'integer',
      name: 'selfmod.messages.maximum',
      minimum: 1,
      maximum: 20,
      default: 5,
    },
    
    // Example: Dashboard-only setting
    someInternalSetting: {
      type: 'boolean',
      default: false,
      dashboardOnly: true, // Hidden from chat commands
    },
  } satisfies Record<SchemaDataKey, ConfigurableKeyOptions>);
  
  return cachedConfiguration;
}
```

### SchemaKey - Validation & Parsing

```typescript
export class SchemaKey<K extends GuildDataKey = GuildDataKey> implements ISchemaValue {
  public readonly key: string;
  public readonly description: TypedT<string>;
  public readonly maximum: number | null;
  public readonly minimum: number | null;
  public readonly inclusive: boolean;
  public readonly name: string;
  public readonly property: K;
  public readonly type: Serializer.Name;  // Links to serializer
  public readonly array: boolean;
  public readonly default: unknown;
  public readonly dashboardOnly: boolean;

  public async parse(settings: ReadonlyGuildData, args: SkyraArgs): Promise<ReadonlyGuildData[K]> {
    const { serializer } = this;
    const context = this.getContext(settings, args.t);
    
    const result = await serializer.parse(args, context);
    return result.match({
      ok: (value) => value,
      err: (error) => { throw error.message; }
    });
  }

  public getContext(settings: ReadonlyGuildData, language: TFunction): Serializer.UpdateContext {
    return {
      entity: settings,
      guild: resolveGuild(settings.id),
      t: language,
      entry: this
    };
  }
}
```

### Serializers (Type-Safe Parsing/Serialization)

```typescript
// serializers/role.ts
export class RoleSerializer extends Serializer<Role> {
  public async parse(args, context) {
    const { guild } = context;
    if (!guild) return this.error('Guild not found');
    
    const role = await args.pick('role').catch(() => null);
    if (!role) return this.error('Invalid role');
    
    return this.ok(role);
  }
  
  public stringify(role, context) {
    return `<@&${role.id}>`;
  }
}

// serializers/permissionNode.ts - Complex nested structure
export class PermissionNodeSerializer extends Serializer<PermissionsNode[]> {
  public async parse(args, context) {
    // Parses: "command allow @role deny @user"
    // Returns: [{ allow: [...], deny: [...], id: 'command' }]
  }
}
```

### Available Serializers (30+)

| Serializer | Type | Use Case |
|------------|------|----------|
| `string` | `string` | Prefix, custom text |
| `integer`/`number` | `number` | Thresholds, limits |
| `boolean` | `boolean` | Feature toggles |
| `role`/`uniqueRoleSet` | `Role[]` | Admin/mod roles |
| `channel`/`categoryOrTextChannel` | `Channel` | Log channels |
| `user` | `User` | Ignored users |
| `permissionNode` | `PermissionsNode[]` | Command permissions |
| `command`/`commandMatch` | `SkyraCommand` | Command refs |
| `reactionRole` | `ReactionRole[]` | Reaction role config |
| `stickyRole` | `StickyRole[]` | Persistent roles |
| `timespan` | `number` (ms) | Durations |
| `url` | `string` | Webhook URLs |
| `emoji` | `SerializedEmoji` | Custom emojis |
| `language` | `string` | Locale codes |

### Validation Flow

```
User Input (chat command / dashboard)
       │
       ▼
SchemaKey.parse(settings, args)
       │
       ▼
Serializer.parse(args, context)  ← Type-safe parsing
       │
       ▼
Result<Value, Error>  ← Never throws, returns Result
       │
       ├── ok(value) ──► Write to Prisma via Transaction
       │
       └── err(msg) ──► UserError shown to user
```

### Dashboard Integration

```typescript
// routes/guilds/[guild]/settings.get.ts
export class UserRoute extends Route {
  @authenticated()
  @ratelimit(seconds(5), 2, true)
  public async run(request, response) {
    const settings = await readSettings(guild);
    return this.sendSettings(response, settings); // JSON serialized
  }
}

// routes/guilds/[guild]/settings.patch.ts
// Accepts partial updates, validates each key via SchemaKey.parse()
```

---

## Cross-Cutting Patterns Summary

### 1. Container-Based Dependency Injection
```typescript
// All major services in Sapphire container
container.prisma        // PrismaClient
container.schedule      // ScheduleManager
container.workers       // WorkerManager
container.stores        // Piece stores (commands, tasks, serializers...)
```

### 2. Async Disposable Pattern (Resource Safety)
```typescript
// Transaction implements [Symbol.dispose] / Symbol.asyncDispose
using trx = await writeSettingsTransaction(guild);
// Automatic lock release on scope exit (success or error)
```

### 3. Collection-Based Caching
```typescript
// Discord.js Collection<Snowflake, T> for all caches
cache: Collection<string, GuildData>
locks: Collection<string, AsyncQueue>
settingsContextCache: Collection<Snowflake, SettingsContext>
```

### 4. Structured Logging with Piece Context
```typescript
getLogPrefix(piece) // "[ commands => ban ]"
container.logger.info(getLogPrefix(this), 'Message');
```

### 5. Internationalization-First Design
```typescript
// Every user-facing string goes through i18n
t(LanguageKeys.Commands.Admin.ConfSettingNotSet)
// 20+ languages supported with fallback
```

---

## Recommendations for Lumi v2

| Skyra Pattern | Lumi v2 Adoption |
|---------------|------------------|
| Worker thread pool | ✅ Adopt for image gen, ML inference, heavy computation |
| Per-guild AsyncQueue | ✅ Critical for settings writes, moderation actions |
| SettingsContext derived cache | ✅ Replace manual cache invalidation |
| Sapphire Piece system | ✅ Already using - extend for tasks/schedules |
| Prisma-backed ScheduleManager | ✅ Replace ad-hoc timers |
| SchemaKey + Serializer validation | ✅ Replace ad-hoc validation in dashboard API |
| Container DI | ✅ Standardize service registration |

---

## File Reference Index

| Component | Files |
|-----------|-------|
| **Worker Pool** | `src/lib/moderation/workers/WorkerManager.ts`, `WorkerHandler.ts`, `worker.mjs`, `types.ts` |
| **AsyncQueue (Settings)** | `src/lib/database/settings/functions.ts` |
| **AsyncQueue (Moderation)** | `src/lib/moderation/managers/ModerationManager.ts` |
| **Fetch Queue** | `src/lib/discord/GuildMemberFetchQueue.ts` |
| **SettingsContext** | `src/lib/database/settings/context/SettingsContext.ts`, `functions.ts` |
| **Pieces (Commands)** | `src/lib/structures/commands/SkyraCommand.ts`, `src/commands/**` |
| **Pieces (Tasks)** | `src/lib/schedule/structures/Task.ts`, `TaskStore.ts`, `src/tasks/**` |
| **Pieces (Serializers)** | `src/lib/database/settings/structures/SerializerStore.ts`, `src/serializers/**` |
| **ScheduleManager** | `src/lib/schedule/manager/ScheduleManager.ts`, `ScheduleEntry.ts` |
| **Prisma Schedule** | `prisma/schema.prisma` (lines 216-225) |
| **Configuration Schema** | `src/lib/database/settings/configuration.ts`, `schema/SchemaKey.ts`, `SchemaGroup.ts` |
| **Client Setup** | `src/lib/SkyraClient.ts` |