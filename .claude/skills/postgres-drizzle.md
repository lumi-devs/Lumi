# Postgres + Drizzle ORM Patterns

Drizzle is the ORM. `postgres` npm package is the driver (faster than `pg`, better TypeScript).

---

## Three Table Categories Per Module

Every module has at most these three table types:

### 1. Guild Config (one row per guild)
```typescript
// src/modules/birthday/lib/schema.ts
export const birthdayGuildConfig = pgTable('birthday_guild_config', {
  guildId: bigint('guild_id', { mode: 'bigint' }).primaryKey(),
  channelId: bigint('channel_id', { mode: 'bigint' }),
  message: text('message').notNull().default('🎂 Happy birthday {user}!'),
  enabled: boolean('enabled').notNull().default(true),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
```

### 2. User/Member Data (one row per user per guild)
```typescript
export const birthdayEntries = pgTable('birthday_entries', {
  guildId: bigint('guild_id', { mode: 'bigint' }).notNull(),
  userId: bigint('user_id', { mode: 'bigint' }).notNull(),
  birthday: date('birthday').notNull(),
  announcedYear: integer('announced_year'),
}, (t) => ({
  pk: primaryKey({ columns: [t.guildId, t.userId] }),
  guildIdx: index('idx_birthday_guild').on(t.guildId),
}));
```

### 3. Append-Only Logs (indexed for time-range queries)
```typescript
export const moderationCases = pgTable('moderation_cases', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  guildId: bigint('guild_id', { mode: 'bigint' }).notNull(),
  // ...
}, (t) => ({
  guildTimeIdx: index('idx_cases_guild_time').on(t.guildId, t.createdAt),
}));
```

---

## Query Patterns

```typescript
import { eq, and, desc, isNull, gte } from 'drizzle-orm';
import { container } from '@sapphire/framework';

const db = container.db;

// Single row lookup
const config = await db.query.birthdayGuildConfig.findFirst({
  where: (t, { eq }) => eq(t.guildId, BigInt(guildId)),
});

// Upsert (insert or update)
await db.insert(birthdayGuildConfig)
  .values({ guildId: BigInt(guildId), channelId: BigInt(channelId) })
  .onConflictDoUpdate({
    target: birthdayGuildConfig.guildId,
    set: { channelId: BigInt(channelId), updatedAt: new Date() },
  });

// Delete
await db.delete(birthdayEntries)
  .where(and(
    eq(birthdayEntries.guildId, BigInt(guildId)),
    eq(birthdayEntries.userId, BigInt(userId)),
  ));

// List with filter
const cases = await db
  .select()
  .from(moderationCases)
  .where(eq(moderationCases.guildId, BigInt(guildId)))
  .orderBy(desc(moderationCases.createdAt))
  .limit(10);
```

---

## Schema Registration

Every module exports its tables from `lib/schema.ts` and re-exports through `src/db/schema/index.ts`:

```typescript
// src/db/schema/index.ts — add one line per module
export * from './core.js';
export * from '../../modules/birthday/lib/schema.js';
export * from '../../modules/afk/lib/schema.js';
```

This gives the Drizzle client full type awareness across all modules.

---

## Migrations

```bash
# Generate migration files from schema changes
npm run db:generate

# Apply to database (development)
npm run db:push

# Apply via migration files (production)
npm run db:migrate
```

Migration files live in `drizzle/`. Commit them. Never hand-edit a generated migration.

---

## Discord IDs: Always bigint

Discord snowflake IDs exceed JavaScript's safe integer range.

```typescript
// Always store as bigint in Postgres
guildId: bigint('guild_id', { mode: 'bigint' }).notNull()

// Convert when reading from Discord.js (strings) or writing to Discord.js
const guildId = BigInt(interaction.guild.id);  // DB insert
const channelId = String(row.channelId);        // Discord.js lookup
```

---

## Rules

- **No shared `config_values` table** — every module owns typed tables
- **Always `mode: 'bigint'`** for Discord IDs in Drizzle
- **Always `withTimezone: true`** on timestamp columns
- **Always add indexes** for columns used in WHERE or ORDER BY
- **Export all schemas through `src/db/schema/index.ts`**
- **Never call raw SQL** — use Drizzle query builder (SQL injection prevention)
- **Never drop tables on module unload** — tables persist; only data changes
- **`generatedAlwaysAsIdentity()`** for autoincrement PKs (Postgres-native, better than `serial`)
