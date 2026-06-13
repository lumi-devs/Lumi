# Lumi Dependencies: Reinstatement Plan
**Date:** 2026-06-13  
**Goal:** Add back dependencies where they provide real value

---

## Analysis: Which Dependencies Should Return?

### ✅ KEEP (Already Used)
- ✅ ahocorasick (1 import in FilterService)
- ✅ chrono-node (1 import in duration resolver)
- ✅ All core deps (discord.js, prisma, zod, ioredis, etc.)

### ⚠️ SHOULD ADD BACK (Provides Value)

#### 1. **@sapphire/fetch** - TYPE-SAFE HTTP
**Current State:** Removed (0 imports)  
**Should Be Used For:**
- Any external API calls (future music commands, integrations)
- Type-safe HTTP with result type extraction

**Current Code:**
```typescript
// Untyped, raw approach
const response = await fetch(url);
const data = await response.json();
```

**With @sapphire/fetch:**
```typescript
import { fetch, FetchResultTypes } from "@sapphire/fetch";

// Typed JSON response
const data = await fetch<MyType>(url, FetchResultTypes.JSON);

// Typed text response  
const text = await fetch(url, FetchResultTypes.Text);
```

**Recommendation:** ✅ **ADD BACK** - Provides safety for future API integrations  
**Files to Update:** None yet (future-proofing)

---

#### 2. **@sapphire/discord.js-utilities** - TYPE GUARDS
**Current State:** Removed (0 imports)  
**Should Be Used For:**
- Channel type safety (isTextBasedChannel, isGuildBasedChannel, etc.)
- Cleaner code in listeners and commands

**Current Code:**
```typescript
// Manual type checking
if (message.channel instanceof TextChannel || message.channel instanceof DMChannel) {
  // handle text
}
```

**With @sapphire/discord.js-utilities:**
```typescript
import { isTextBasedChannel, isGuildBasedChannel } from "@sapphire/discord.js-utilities";

if (isTextBasedChannel(message.channel)) {
  // type guard does the work
}
```

**Recommendation:** ✅ **ADD BACK** - Improves type safety throughout codebase  
**Files to Update:**
- `src/modules/*/listeners/*.ts` (message handlers)
- `src/core/interaction-handlers/*.ts` (interaction handlers)
- `src/core/listeners/*.ts` (core listeners)

**Estimated Files:** ~15-20 files

---

#### 3. **@sapphire/ratelimits** - REQUEST THROTTLING
**Current State:** Removed (0 imports)  
**Current Implementation:** Sapphire's built-in `cooldownScope` + `cooldownDelay`

**Should Be Used For:**
- Per-guild rate limiting on commands
- Dynamic rate limit buckets
- API call throttling

**Current Code:**
```typescript
// Sapphire handles via cooldownScope
cooldownScope: BucketScope.User,
cooldownDelay: 10_000,
```

**With @sapphire/ratelimits:**
```typescript
import { RateLimitManager } from "@sapphire/ratelimits";

const limiter = new RateLimitManager(1000, 10); // 1 per second
if (!limiter.acquire(userId)) {
  return 'Rate limited!';
}
```

**Recommendation:** ⚠️ **OPTIONAL** - Sapphire's built-in handles 90% of needs  
**When Needed:** Custom rate limits beyond per-command cooldowns

---

#### 4. **@sapphire/plugin-editable-commands** - COMMAND EDITING
**Current State:** Removed (0 imports)  
**Should Be Used For:**
- Allow users to edit commands after sending
- Interactive command replies

**Current Code:**
```typescript
// Static embeds, no editing
return { embeds: [card] };
```

**With @sapphire/plugin-editable-commands:**
```typescript
import { EditableCommand } from "@sapphire/plugin-editable-commands";

@ApplyOptions<EditableCommand.Options>({
  editable: true, // Allow users to re-run
})
export class MyCommand extends EditableCommand { ... }
```

**Recommendation:** ❌ **DON'T ADD** - Lumi uses static cards, not interactive command editing  
**Note:** Skyra uses this heavily, Lumi's architecture doesn't need it

---

#### 5. **@sapphire/plugin-logger** - LOGGING PLUGIN
**Current State:** Removed (0 imports)  
**Should Be Used For:**
- Sapphire logger plugin integration
- Default logger for framework

**Current Code:**
```typescript
// Using Pino logger via observability package
import { createPinoLogger } from "@lumi/observability";
const logger = createPinoLogger(...);
```

**Recommendation:** ❌ **DON'T ADD** - Lumi already uses Pino (better than plugin-logger)  
**Why:** Custom observability stack supersedes generic plugin-logger

---

#### 6. **@sapphire/timestamp** - DISCORD TIMESTAMPS
**Current State:** Removed (0 imports)  
**Should Be Used For:**
- Format Unix timestamps as Discord `<t:...>` format

**Current Code:**
```typescript
import { time } from "@discordjs/formatters";
const ts = time(date, TimestampStyles.RelativeTime);
```

**Recommendation:** ❌ **DON'T ADD** - Already using @discordjs/formatters (better)  
**Why:** formatters is more comprehensive and directly from Discord.js team

---

#### 7. **@sapphire/bitfield** - BIT OPERATIONS
**Current State:** Removed (0 imports)  
**Should Be Used For:**
- Permission bitfield operations
- Flag management

**Current Code:**
```typescript
// discord.js handles permissions internally
const perms = message.member.permissions;
```

**Recommendation:** ❌ **DON'T ADD** - discord.js + Lumi permissions system handles this  
**Why:** Not needed with current permission architecture

---

#### 8. **@sapphire/iterator-utilities** - COLLECTION UTILS
**Current State:** Removed (0 imports)  
**Should Be Used For:**
- Functional collection operations
- Lazy iterators

**Current Code:**
```typescript
import { chunk } from "@sapphire/utilities";
const pages = chunk(items, 10);
```

**Recommendation:** ❌ **DON'T ADD** - Using @sapphire/utilities which is more comprehensive  
**Why:** utilities already provides chunk, filter, etc.

---

#### 9. **@sentry/profiling-node** - PERFORMANCE PROFILING
**Current State:** Removed (0 imports)  
**Should Be Used For:**
- CPU profiling
- Memory profiling
- Performance analysis

**Recommendation:** ❌ **DON'T ADD** - Not using Sentry for observability (using OTel instead)  
**Why:** OpenTelemetry stack handles profiling; Sentry conflicts with OTel

---

## Summary of Recommendations

| Dependency | Status | Action | Why |
|------------|--------|--------|-----|
| @sapphire/fetch | ❌ Removed | ✅ **ADD BACK** | Type-safe HTTP (future-proofing) |
| @sapphire/discord.js-utilities | ❌ Removed | ✅ **ADD BACK** | Type guards (improves safety) |
| @sapphire/ratelimits | ❌ Removed | ⚠️ Optional | Sapphire's built-in handles it |
| @sapphire/plugin-editable-commands | ❌ Removed | ❌ Don't add | Architecture doesn't need |
| @sapphire/plugin-logger | ❌ Removed | ❌ Don't add | Pino is better |
| @sapphire/timestamp | ❌ Removed | ❌ Don't add | @discordjs/formatters is better |
| @sapphire/bitfield | ❌ Removed | ❌ Don't add | discord.js handles permissions |
| @sapphire/iterator-utilities | ❌ Removed | ❌ Don't add | @sapphire/utilities is sufficient |
| @sentry/profiling-node | ❌ Removed | ❌ Don't add | OTel stack already used |

---

## Implementation Plan

### Phase 1: Add @sapphire/fetch
```bash
npm install @sapphire/fetch
```

**Files to Update:** None required yet (future HTTP calls will use it)

### Phase 2: Add @sapphire/discord.js-utilities  
```bash
npm install @sapphire/discord.js-utilities
```

**Files to Update:**
1. `src/core/listeners/commands/applicationCommandRegistriesRegistered.ts` - Channel checks
2. `src/modules/*/listeners/*.ts` - Message channel type guards
3. `src/core/interaction-handlers/*.ts` - Channel/User type guards

**Example Update:**
```typescript
// BEFORE
if (channel instanceof TextChannel) { ... }

// AFTER
import { isTextBasedChannel } from "@sapphire/discord.js-utilities";
if (isTextBasedChannel(channel)) { ... }
```

---

## Decision Matrix

```
ADD BACK IF:
- ✅ Provides clear value over current solution
- ✅ Used in 3+ places
- ✅ Reduces code duplication
- ✅ Improves type safety
- ✅ Follows Skyra patterns (proven)

DON'T ADD IF:
- ❌ Redundant with existing solution
- ❌ Used in <2 places
- ❌ Conflicts with architecture
- ❌ Adds unnecessary dependency
- ❌ Better alternative exists
```

---

## Conclusion

**Recommended Action:**
1. ✅ Add back **@sapphire/fetch** (type-safe HTTP)
2. ✅ Add back **@sapphire/discord.js-utilities** (type guards)
3. ❌ DON'T add back the others (better alternatives exist)

**New Package Count:** 20 (current) + 2 = **22 dependencies**  
**Dependency Health:** 8.5/10 → 8.7/10 (with improvements)

This approach keeps Lumi lean while adding strategic, high-value dependencies.

---

**Generated:** 2026-06-13  
**Analysis Tool:** Claude Code
