# ember-sapphire-framework

Definitive developer guidelines, patterns, and API reference for the Sapphire Framework (v5), official plugins, and utility libraries.
Load this skill when designing or extending Sapphire pieces (Commands, Subcommands, Listeners, Interaction Handlers), working with validation schemas (Shapeshift, Result), implementing rate limiters, using sequential locks (AsyncQueue), or setting up REST API endpoints.

---

## 1. Sapphire Piece Architecture

Every functional component in Sapphire is a "Piece" managed by a specific "Store". Always configure pieces using the `@ApplyOptions` decorator to declare metadata cleanly instead of calling `super()`.

| Piece Type | Base Class | Store Name | Purpose |
|---|---|---|---|
| Command | `Command` or `EmberSubcommand` | `commands` | Core bot slash or message prefix command |
| Listener | `Listener` | `listeners` | Event handler matching a specific gateway event |
| Interaction Handler | `InteractionHandler` | `interaction-handlers` | Processes buttons, select menus, and modals |
| Precondition | `Precondition` | `preconditions` | Command execution gating and validation checks |

---

## 2. Integrated Plugins Directory

These modules extend the core Sapphire client and are registered side-effectfully in `src/client/setup.ts`.

### A. Subcommands (`@sapphire/plugin-subcommands`)
Allows grouping multiple related actions under a single Slash Command.
* **Usage:** Map subcommand names to execution methods inside `@ApplyOptions`.

```typescript
import { EmberSubcommand } from '#lib/commands.js';
import { Subcommand } from '@sapphire/plugin-subcommands';

@ApplyOptions<Subcommand.Options>({
    name: 'profile',
    subcommands: [
        { name: 'view', chatInputRun: 'chatInputView', default: true },
        { name: 'edit', chatInputRun: 'chatInputEdit' }
    ]
})
export class ProfileCommand extends EmberSubcommand {
    public async chatInputView(interaction: Subcommand.ChatInputCommandInteraction) {
        // Read user profile
    }
}
```

### B. Internationalization (`@sapphire/plugin-i18next`)
Handles guild-specific multi-language translation and localization.
* **Usage:** Resolving translations using localized dictionary keys under `src/languages/`.

```typescript
import { fetchT } from '@sapphire/plugin-i18next';

const t = await fetchT(interaction.guildId!);
const message = t('commands/ping:success');
```

### C. Scheduled Tasks (`@sapphire/plugin-scheduled-tasks`)
Manages background execution queues backed by Redis or SQS.
* **Usage:** Delaying tasks, cron jobs, and recurring automation.

```typescript
await this.container.tasks.create('cleanupJob', { userId }, 10 * 60 * 1000);
```

### D. Stylized Logger (`@sapphire/plugin-logger`)
Provides beautiful console logging outputs with severity gating.
* **Usage:** Logging info, debug, warnings, and system errors.

```typescript
this.container.logger.info('Connected to PostgreSQL database');
```

### E. Rest API Server (`@sapphire/plugin-api`)
Exposes a built-in REST API web server directly inside the bot's runtime process.
* **Usage:** Creating REST routes for dashboard integrations or external monitoring.

```typescript
import { Route, type ApiRequest, type ApiResponse } from '@sapphire/plugin-api';

export class StatusRoute extends Route {
    public run(request: ApiRequest, response: ApiResponse) {
        response.json({ uptime: this.container.client.uptime });
    }
}
```

### F. Editable Commands (`@sapphire/plugin-editable-commands`)
Allows users to edit their message command triggers, automatically re-running the command and updating the bot's response without cluttering the chat.

### G. Hot Module Reloading (`@sapphire/plugin-hmr`)
Watches and automatically reloads modified command/listener files in development without restarting the bot.

---

## 3. Data Validation & Inputs

### A. Fast Schema Validation (`@sapphire/shapeshift`)
Safe input validation and type-casting. Similar to Zod but optimized for maximum speed.
* **Usage:** Validating custom command arguments or dashboard input payloads.

```typescript
import { s } from '@sapphire/shapeshift';

const userSchema = s.object({
    username: s.string.lengthGreaterThan(3),
    age: s.number.int.positive.lessThan(100)
});

const result = userSchema.parse({ username: 'Ember', age: 24 });
```

### B. Rust-like Error Handling (`@sapphire/result`)
TypeScript port of Rust's `Result` and `Option` structs to safely handle functions that can fail without throwing expensive try/catch errors.
* **Usage:** Database queries, network requests, and configuration resolution.

```typescript
import { Result } from '@sapphire/result';

function divide(a: number, b: number): Result<number, string> {
    if (b === 0) return Result.err('Division by zero');
    return Result.ok(a / b);
}
```

### C. Input Parser (`@sapphire/lexure`)
Advanced tokenization and lexical parsing for raw string arguments.
* **Usage:** Parsing complex quote blocks or command arguments in legacy prefix commands.

---

## 4. Discord-Specialized Mechanics

### A. Snowflake Parsing (`@sapphire/snowflake`)
Generating, parsing, and decomposing Discord Snowflakes.
* **Usage:** Extracting timestamps, worker IDs, process IDs, and increment numbers from user or server IDs.

```typescript
import { DiscordSnowflake } from '@sapphire/snowflake';

const deconstructed = DiscordSnowflake.deconstruct('123456789012345678');
console.log(deconstructed.timestamp); // Returns exact Date snowflake was created
```

### B. Rate-Limiting Buckets (`@sapphire/ratelimits`)
High-performance bucket-based ratelimit tracking.
* **Usage:** Gating commands or message actions to prevent spam.

```typescript
import { RateLimitManager } from '@sapphire/ratelimits';

const manager = new RateLimitManager(5000, 2); // 2 requests allowed per 5s
const bucket = manager.acquire(userId);
if (bucket.limited) throw new Error('Rate-limited!');
bucket.consume();
```

### C. Anti-Phishing Integration (`@sapphire/phisherman`)
Direct wrapper around the Phisherman API to instantly block malicious links and scam websites.

### D. Discord.js Utility Toolkit (`@sapphire/discord.js-utilities`)
Specialized Discord.js extensions.
* **Usage:** Interactive prompts, Paginated responses, and channel type checks.

```typescript
import { sendPaginatedMessage } from '@sapphire/discord.js-utilities';

await sendPaginatedMessage(interaction, [embedPage1, embedPage2]);
```

---

## 5. General Core & Time Utilities

### A. Standard Utility Helpers (`@sapphire/utilities`)
* **`isNullish(val)`**: Returns `true` if variable is `null` or `undefined`.
* **`cutText(str, maxLength)`**: Truncates string gracefully without breaking words.
* **`chunk(array, size)`**: Splits array into arrays of size.
* **`isFunction(val)`**: Returns `true` if input is an executable function.
* **`deepClone(obj)`**: Extremely fast deep cloning utility.

### B. Date & Time Parsing (`@sapphire/time-utilities` & `@sapphire/duration` & `@sapphire/timer-manager` & `@sapphire/cron` & `@sapphire/timestamp`)
* **`Duration`**: Converts natural time notations (e.g. `2h30m`, `3d`) to milliseconds.
* **`time()`**: Formatted Discord markdown timestamps.
* **`Cron`**: Standard cron pattern scheduler.
* **`TimerManager`**: Manages setTimeouts and setIntervals cleanly to prevent memory leaks.

```typescript
import { Duration } from '@sapphire/time-utilities';
const duration = new Duration('3d').offset; // 259200000 ms
```

### C. Execution Stopwatch (`@sapphire/stopwatch`)
High-precision performance timing.
* **Usage:** Measuring database query durations, API responses, or bot latency.

```typescript
import { Stopwatch } from '@sapphire/stopwatch';

const stopwatch = new Stopwatch();
// ... run some heavy queries ...
console.log(`Execution time: ${stopwatch.stop().toString()}`);
```

### D. Sequential Locks (`@sapphire/async-queue`)
Queue-based synchronous locking mechanism for handling promise chains sequentially (perfect for message queues or database concurrency locks!).

```typescript
import { AsyncQueue } from '@sapphire/async-queue';

const queue = new AsyncQueue();
await queue.wait();
try {
    // Critical atomic section
} finally {
    queue.shift(); // Unlock for the next request
}
```

### E. Fast Runtime Type Gating (`@sapphire/type`)
In-depth, high-speed runtime type detection.
* **Usage:** Safely checking data payloads from external sources.

```typescript
import { Type } from '@sapphire/type';
console.log(new Type(new Map()).toString()); // Outputs "Map<unknown, unknown>"
```
