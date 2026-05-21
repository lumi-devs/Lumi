# Sapphire Ecosystem — Full Package Reference

All packages are under `@sapphire/` from github.com/sapphiredev.

---

## Core

| Package | Purpose | Install |
|---|---|---|
| `@sapphire/framework` | Core framework — Pieces, Client, commands, preconditions | always |
| `@sapphire/utilities` | Common utils: `isNullish`, `isNullishOrEmpty`, `chunk`, `debounce`, etc. | always |
| `@sapphire/ts-config` | Shared TypeScript config presets | devDep |

---

## Plugins (all in `@sapphire/plugins` monorepo)

| Package | Purpose | Use when |
|---|---|---|
| `@sapphire/plugin-logger` | Structured logger with colored output | always |
| `@sapphire/plugin-scheduled-tasks` | Cron + one-time jobs via BullMQ/Redis | any recurring work |
| `@sapphire/plugin-i18n` | Internationalisation support | multi-language bots |
| `@sapphire/plugin-api` | REST API server embedded in the bot | future web dashboard HTTP endpoints |
| `@sapphire/plugin-subcommands` | Nested subcommand handling | complex slash command trees |
| `@sapphire/plugin-editable-commands` | Edit messages to re-run commands | prefix command bots |
| `@sapphire/plugin-hmr` | Hot module reload in development | dev only |

**Register plugins before client creation:**
```typescript
import '@sapphire/plugin-logger/register';
import '@sapphire/plugin-scheduled-tasks/register';
```

---

## Discord.js Utilities

| Package | Purpose | Key exports |
|---|---|---|
| `@sapphire/discord.js-utilities` | Pagination, paginators, menus, modals | `PaginatedMessage`, `MessagePrompter`, `isGuildMember` |
| `@sapphire/discord-utilities` | Regex, snowflake utils, mention parsing | `DiscordSnowflakeRegex`, `parseEmoji` |
| `@sapphire/decorators` | `@ApplyOptions`, `@RequiresGuildContext`, `@RequiresUserPermissions` | decorate commands cleanly |

---

## Utilities Worth Knowing

| Package | Purpose | Example |
|---|---|---|
| `@sapphire/shapeshift` | Fast input validation (like zod but 5x faster) | validate user-provided data in commands |
| `@sapphire/timestamp` | Time formatting and constants (`Time.Second`, `Time.Hour`) | duration calculations |
| `@sapphire/fetch` | Typed `fetch` wrapper | external API calls |
| `@sapphire/ratelimits` | In-process rate limit buckets | use Redis instead for multi-shard |
| `@skyra/env-utilities` | Typed env vars with `envParseString`, `envParseInteger` | always |
| `@skyra/start-banner` | ASCII art startup banner | cosmetic |

---

## PaginatedMessage (from @sapphire/discord.js-utilities)

More powerful than the custom `makeListCard` pagination — handles multi-page embeds with collector lifecycle, auto-timeout, and full component support.

```typescript
import { PaginatedMessage } from '@sapphire/discord.js-utilities';

const pm = new PaginatedMessage();
pm.addPageEmbed((embed) =>
  embed.setTitle('Page 1').setDescription('First page content')
);
pm.addPageEmbed((embed) =>
  embed.setTitle('Page 2').setDescription('Second page content')
);
await pm.run(interaction);
```

Use `PaginatedMessage` for complex paginated views. Use `makeListCard` for simple string lists.

---

## @sapphire/decorators

```typescript
import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';

@ApplyOptions<Command.Options>({
  name: 'ping',
  description: 'Pong!',
  preconditions: ['GuildOnly'],
})
export class PingCommand extends Command {
  public override async chatInputRun(interaction: Command.ChatInputCommandInteraction) {
    await interaction.reply('Pong!');
  }
}
```

Replaces constructor boilerplate. Optional — works alongside or instead of constructor options.

---

## Scheduled Tasks Setup (plugin-scheduled-tasks)

Requires Redis. Uses BullMQ internally — tasks persist across restarts.

```typescript
// In CLIENT_OPTIONS:
tasks: {
  bull: {
    connection: { host: 'localhost', port: 6379, db: 1 }
  }
}

// Declare in Augments.d.ts:
declare module '@sapphire/framework' {
  interface ScheduledTasks {
    myTask: { userId: string };  // typed payload
  }
}

// Schedule a task:
await container.tasks.create('myTask', { userId: '123' }, { delay: 5000 });

// Cron task (runs forever):
// In the ScheduledTask piece constructor:
super(context, { ...options, name: 'myTask', pattern: '0 8 * * *' });
```

---

## What NOT to Use from Sapphire

| Package | Why skip |
|---|---|
| `@sapphire/plugin-api` | If using Redis pub/sub RPC — avoid adding HTTP server unless dashboard explicitly needs it |
| `@sapphire/ratelimits` | In-process only. Use Redis sliding windows for cross-shard rate limits |
| `@sapphire/plugin-editable-commands` | Only needed for prefix command bots — Ember is slash-command-first |

---

## Awesome Sapphire (community resources)
- github.com/sapphiredev/awesome-sapphire — curated list of bots, plugins, utilities built on Sapphire
- sapphirejs.dev — official docs + guides
