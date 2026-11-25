# Lumi v2 Dashboard Data Flow Audit

## Executive Summary

This audit documents the Lumi v2 Discord bot dashboard data flow, covering authentication, RPC communication, module configuration, caching/invalidation, guild data, and identified gaps (no real-time updates, no concurrent edit protection).

---

## 1. RPC Client with Bearer Token & Loopback Guard

### File: `lumi-v2/apps/dashboard/src/lib/server/rpc.ts`

**Bearer Token Implementation (lines 63-65):**
```typescript
if (config.rpcInternalToken) {
  headers.set("authorization", `Bearer ${config.rpcInternalToken}`);
}
```

**Configuration Source (`lumi-v2/apps/dashboard/src/lib/server/env.ts:80-81`):**
```typescript
rpcUrl: Trim(process.env.RPC_URL),
rpcInternalToken: Trim(process.env.RPC_INTERNAL_TOKEN),
```

**Loopback Guard:** Not explicitly implemented in the dashboard RPC client. The bot's RPC handler (`lumi-v2/src/core/rpcRoutes.ts:133-136`) validates the bearer token:
```typescript
if (!isAuthorized(req, token)) {
  finish(401, { error: "unauthorized" });
  return;
}
```
Where `isAuthorized` checks the `authorization` header against the shared `RPC_INTERNAL_TOKEN`.

**RPC Timeout:** 5 seconds default (`rpc.ts:53`), extended to 15s for addon operations.

---

## 2. Session Auth: Discord OAuth + JWT

### OAuth Flow: `lumi-v2/apps/dashboard/src/routes/auth/callback/+server.ts`

1. **State/CSRF Protection:** State stored in Redis with PKCE verifier (`lumi-v2/apps/dashboard/src/lib/server/discord.ts:98-120`)
2. **Code Exchange:** `exchangeCode()` → Discord token endpoint (`discord.ts:150-165`)
3. **Token Storage:** Access/refresh tokens + expiry stored in session record (`session.ts:9-19`)

### Session Record Schema (`lumi-v2/apps/dashboard/src/lib/server/session.ts:9-19`):
```typescript
const SessionSchema = z.object({
  userId: z.string().min(1),
  username: z.string().min(1),
  displayName: z.string().nullable(),
  avatar: z.string().nullable(),
  accessToken: z.string().min(1),      // Discord OAuth access token
  refreshToken: z.string().nullable(), // Discord OAuth refresh token
  tokenExpiresAt: z.number(),         // Unix timestamp
  csrfToken: z.string().min(16),      // Per-session CSRF token
  createdAt: z.number(),
});
```

### Session Lifecycle:
- **Creation:** `createSession()` → stores HMAC-signed ID in Redis (`session.ts:65-81`)
- **Validation:** `readSession()` verifies HMAC + Redis lookup + TTL (`session.ts:83-117`)
- **Refresh:** `validAccessToken()` auto-refreshes expired Discord tokens (`auth.ts:32-67`)
- **Cookie:** `lumi_dashboard_session` = `{id}.{hmac(id)}` with `HttpOnly`, `Secure`, `SameSite=Lax`

### Hooks Integration (`hooks.server.ts:6-23`):
```typescript
const cookie = event.cookies.get(SessionCookie);
if (cookie) {
  const loaded = await readSession(cookie);
  if (loaded) {
    event.locals.sessionId = loaded.id;
    event.locals.session = loaded.record;
  }
}
```

---

## 3. Module Config: Zod Schemas per Module & Form Generation

### Module Discovery: `lumi-v2/apps/dashboard/src/lib/server/modules.ts:39-68`

Fetches module catalog via RPC (`fetchModules()`) with 60s TTL cache. Transforms RPC `RpcConfigField` → `ConfigField` (from `@lumi/module-kit`).

### Zod Schema Generation: `lumi-v2/apps/dashboard/src/lib/server/moduleConfig.ts:60-177`

`fieldSchema()` maps each `ConfigField.type` to Zod:

| Field Type | Zod Schema |
|------------|------------|
| `number` | `z.coerce.number().finite().int()` (configurable min/max) |
| `channel` / `role` | Snowflake regex `/^\d{16,22}$/` |
| `multi-channel` / `multi-role` | `z.array(Snowflake).max(100)` |
| `multi-string` | `z.array(z.string().min(1).max(200)).max(100)` |
| `json` | `z.string().max(50000).transform(JSON.parse)` |
| `escalation` | Complex transform validating warning-count → action mapping |
| `select` | `z.enum(choices)` or `z.string().max(200)` |
| `boolean` | `z.boolean()` |
| `string` (default) | `z.string().max(2000)` |

### Form Parsing: `parseConfigForm()` (`moduleConfig.ts:185-266`)

Handles FormData → validated config:
- Boolean: checkbox presence
- Multi-fields: newline/comma split → array validation
- JSON/escalation: parse + transform validation
- Regex fields: compile-time validation via `compileSafeRegex()`

### UI Generation: `lumi-v2/apps/dashboard/src/lib/components/ConfigFieldInput.svelte`

Dynamic component rendering based on `field.type`:
- Boolean → checkbox
- Select → `<select>` with choices
- JSON/multi → `<textarea>`
- Number → `<input type="number">`
- Channel/role → snowflake input
- String → `<input type="text">`

---

## 4. Data Flow: Dashboard Writes → Prisma → Invalidation Pub/Sub → Bot Cache Refresh

### Write Path (Dashboard → Prisma)

**Module Config Save** (`guilds/[guildId]/modules/[module]/+page.server.ts:170-228`):
```typescript
// 1. Parse & validate form
const parsed = parseConfigForm(fields, data);

// 2. Verify Discord targets exist
const targets = await verifyGuildTargets(guildId, targetIds(...));

// 3. Write to Prisma (serializable transaction)
await setGuildSetting(guildId, module.configKey, parsed.values);
// → settings.ts:39-67 mutateSettings() with isolationLevel: "Serializable"

// 4. Update module enabled state in DB
await prisma.guildModule.upsert({ where: { guildId_module: {...} }, update: { enabled } });

// 5. RPC to bot for immediate state sync
const sync = await setModuleStateViaRpc(guildId, module.name, enabled);

// 6. Audit log
await recordAudit({ guildId, userId, action: "dashboard.module.config", ... });
```

**Settings Persistence** (`lumi-v2/apps/dashboard/src/lib/server/settings.ts:39-67`):
```typescript
async function mutateSettings(guildId, mutate) {
  for (let attempt = 0; attempt < 4; attempt++) {
    await prisma.$transaction(async (tx) => {
      const guild = await tx.guild.findUnique({ where: { id: guildId }, select: { settings: true } });
      const settings = asSettings(guild?.settings);
      mutate(settings);
      await tx.guild.upsert({ where: { id: guildId }, update: { settings: value }, create: { id: guildId, settings: value } });
    }, { isolationLevel: "Serializable" });
    return;
  }
}
```

### Invalidation Pub/Sub (Dashboard → Bot)

**Dashboard publishes** when config changes:
- Module catalog cache invalidated via `invalidateModuleCatalog()` (`modules.ts:70-73`)
- Uses `@lumi/cache` with `InvalidationBus` from `@lumi/redis`

**Invalidation Bus Implementation** (`lumi-v2/packages/redis/src/invalidation.ts`):
- Channel: `"lumi:invalidation"`
- Message format: `{ namespace: string, keys: string[], timestamp: number }`
- Subscriber + publisher Redis connections
- Local listener registry per namespace

**Dashboard Cache Setup** (`lumi-v2/apps/dashboard/src/lib/server/dashboardCache.ts:107-138`):
```typescript
const invalidation = getInvalidationBus();
const userGuildsCache = createCache({ redis, invalidation, ... }).namespace("userGuilds");
const moduleCatalogCache = createCache({ redis, invalidation, ... }).namespace("moduleCatalog");
```

**Bot Receives Invalidation** — **CRITICAL GAP**: Bot's `ConfigService` (`lumi-v2/src/admin/services/ConfigService.ts`) has a cache (`NamespacedCache<GuildSettings>`) but **no invalidation subscription is wired up**. The cache uses `getOrLoad()` with 60s TTL but never subscribes to `"lumi:invalidation"` channel.

**Bot Module State RPC Handler** (`lumi-v2/src/core/rpcRoutes.ts:204-208`) **DOES** publish invalidation:
```typescript
await moduleLoader.setEnabled(moduleName, guildId, enabled);
if (invalidation) {
  await invalidation.invalidate("modules", [guildId]);
}
```
But this only fires when dashboard calls `setModuleStateViaRpc()` for module enable/disable, NOT for config value changes.

---

## 5. Guild List from Guild Table

### Source: `lumi-v2/apps/dashboard/src/routes/guilds/+page.server.ts:5-15`

```typescript
export const load: PageServerLoad = async (event) => {
  requireSession(event);
  const guilds = await manageableGuilds(event);
  return { guilds: guilds.map(...).sort(...) };
};
```

### `manageableGuilds()` (`lumi-v2/apps/dashboard/src/lib/server/auth.ts:69-111`):

1. Gets valid Discord access token (auto-refreshes if expired)
2. Calls `fetchUserGuilds(token, userId)` → Discord API `/users/@me/guilds`
3. Caches user guilds in Redis for 45s (`discord.ts:211-221`)
4. Filters to `canManageGuild(guild)` → checks `MANAGE_GUILD` permission bit (`discord.ts:258-269`)
5. Returns `GuildAccess[]` with `{ id, name, icon, owner, permissions }`

**Note:** Guild list comes from **Discord OAuth user token**, not the bot's guild table. The bot's Prisma `guild` table is only used for dashboard guild detail page (`guilds/[guildId]/+layout.server.ts:9-19`) to get `joinedAt`/`leftAt` and verify bot presence.

---

## 6. No Real-Time Updates (Polling Only)

### Evidence:

1. **Dashboard uses standard SvelteKit form actions** — full page navigation on submit (`+page.svelte` forms with `method="POST" action="?/save"`)
2. **No EventSource/SSE/WebSocket imports** in dashboard codebase (grep confirms)
3. **Cache TTLs are the only "refresh" mechanism:**
   - User guilds: 45s TTL (`discord.ts:10`)
   - Module catalog: 60s TTL (`modules.ts:5`)
   - Bot config cache: 60s TTL (`ConfigService.ts:6`)
4. **No client-side polling logic** — relies on browser navigation + server-side cache expiry
5. **Bot's `ConfigService.read()`** only refreshes on cache miss after TTL expiry

### User Experience Impact:
- Config changes require manual page reload to see updates from other tabs
- Module enable/disable via RPC shows warning if bot doesn't respond immediately
- No live indicators for bot connectivity status (only checked on page load)

---

## 7. No Request Deduplication for Concurrent Tab Edits

### Evidence:

1. **No ETag/If-Match headers** on config reads or writes
2. **No version field** on guild settings in Prisma schema (`lumi-v2/packages/db/prisma/schema.prisma` — `settings` is `Json` field)
3. **No optimistic locking** in `mutateSettings()` — uses Serializable isolation but no version check
4. **No client-side deduplication** — each form submit is independent
5. **CSRF token is per-session, not per-form** — same token valid across tabs

### Race Condition Scenario:
1. User opens module config in Tab A and Tab B
2. Tab A loads config v1, Tab B loads config v1
3. Tab A saves changes → Prisma writes v2
4. Tab B saves different changes → Prisma writes v3 (overwrites v2)
5. **No conflict detection, no warning, last write wins**

### Related: Bot-side `ConfigService.mutate()` (`ConfigService.ts:45-80`) retries on `P2002`/`P2034` but only for unique constraint violations, not for concurrent modification detection.

---

## Summary of Findings

| Area | Status | Notes |
|------|--------|-------|
| RPC Bearer Auth | ✅ Implemented | Shared `RPC_INTERNAL_TOKEN` |
| Loopback Guard | ⚠️ Partial | Bot validates token; dashboard doesn't verify loopback |
| Discord OAuth + JWT | ✅ Implemented | PKCE, token refresh, HMAC sessions |
| Zod Schemas per Module | ✅ Implemented | Dynamic via `fieldSchema()` |
| Form Generation | ✅ Implemented | `ConfigFieldInput.svelte` |
| Prisma Writes | ✅ Implemented | Serializable transactions |
| Invalidation Pub/Sub | ⚠️ One-way | Dashboard→Bot for module enable; **missing for config changes** |
| Bot Cache Invalidation | ❌ Missing | `ConfigService` never subscribes to invalidation channel |
| Guild List Source | ✅ Discord API | User's manageable guilds via OAuth |
| Real-Time Updates | ❌ None | Polling via cache TTL only |
| Concurrent Edit Protection | ❌ None | Last-write-wins, no versioning |

---

## Recommendations

1. **Wire bot ConfigService to invalidation bus** — subscribe to `"lumi:invalidation"` on `config` namespace
2. **Publish invalidation on ALL config writes** — not just module enable/disable
3. **Add optimistic locking** — version field on guild settings or ETag-based concurrency control
4. **Implement SSE for real-time updates** — push config/module state changes to dashboard
5. **Add request deduplication** — per-form CSRF tokens or client-side mutation queue
6. **Consider moving guild list to bot's guild table** — for consistency with bot presence