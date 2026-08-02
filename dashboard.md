# Lumi Web Dashboard 2.0 — Comprehensive Master Specification & Architectural Blueprint

> **File Location:** `/home/rebiz/opt/lumi/dashboard.md`
> **Status:** Approved Master Architecture, Research Synthesis & Security Specification
> **Target Version:** Lumi v1.0.0

---

## Table of Contents

1. [Executive Summary & Core Philosophy](#1-executive-summary--core-philosophy)
2. [Competitive Benchmarks & Lessons Learned](#2-competitive-benchmarks--lessons-learned)
3. [Technology Stack & Architectural Justifications](#3-technology-stack--architectural-justifications)
4. [Public Landing Page Specification](#4-public-landing-page--home-view--specification)
5. [Security Architecture & Threat Mitigations](#5-security-architecture--threat-vulnerability-mitigations)
6. [Advanced Enterprise Extensions](#6-advanced-enterprise-extensions--high-availability-features)
7. [Lumi Brand Design System](#7-lumi-brand-aesthetic--design-system)
8. [Multi-Tier Permission Architecture](#8-multi-tier-permission--role-architecture)
9. [Database Model to UI Component Mapping](#9-exhaustive-database-model-to-ui-component-mapping)
10. [RPC Contract Specification](#10-complete-rpc-protocol--action-contracts)
11. [REST API Endpoint Matrix](#11-rest-api-endpoints-specification)
12. [Step-by-Step Implementation Guide](#12-step-by-step-implementation-guide)

---

## 1. Executive Summary & Core Philosophy

Lumi Web Dashboard 2.0 is an ultra-fast, server-side rendered (SSR) web administration platform designed for high-scale self-hosted Discord communities. It addresses the fundamental flaws of legacy bot web panels: heavy client-side JavaScript bundles, slow load times, fragile coupling between HTTP servers and Discord gateway event loops, and primitive visual styling.

### Primary Architectural Principles

1. **Decoupled Asynchronous RPC Architecture**:
   - The web dashboard (`apps/dashboard`) runs as an isolated Bun process. It communicates asynchronously with bot worker nodes (`apps/worker`) via RabbitMQ RPC queues. A web server crash or DDoS attack **never** impacts bot sharding or Discord gateway latency.
   - *Why this matters*: Every other Discord bot dashboard (Dyno, MEE6, Red-Dashboard) tightly couples its HTTP server to the bot process. Under load, HTTP event processing blocks Discord heartbeat pings, causing disconnections. Lumi avoids this entirely.

2. **Strict Multi-Tenant Permission Isolation**:
   - **Bot Owners (System Admins)**: Full infrastructure governance — global maintenance mode, master module kill-switches, addon Git repository managers, global user/guild blacklists, and cluster sharding telemetry.
   - **Server Owners (Guild Admins)**: Guild-scoped module configuration, moderation infraction management, security panic lockdown controls, dynamic voice channels, role/channel overrides, and custom permit node trees.
   - The two permission tiers are **completely separated** at the route level. A Server Owner cannot access `/system` routes, and a Bot Owner always sees the System Panel first with a secondary server switcher.

3. **Sub-Millisecond Native SSR (`Bun.serve`)**:
   - Zero heavy frontend framework overhead — no React/Vue hydration delays, no webpack bundle downloads.
   - HTML is built directly in Bun memory using TypeScript template literals and served within `<2ms` response times.
   - All interactive behaviour (toggles, save bars, modals) uses minimal vanilla JavaScript injected inline — no external JS frameworks.

---

## 2. Competitive Benchmarks & Lessons Learned

Research was conducted across 8 leading Discord bot platforms. Each contributed specific design lessons:

```
+-------------------+---------------------------------------------+-------------------------------------------------------+
| Platform          | Strengths Learned                           | Weaknesses Eliminated in Lumi                         |
+-------------------+---------------------------------------------+-------------------------------------------------------+
| Red-DiscordBot    | • Decoupled JSON-RPC between web & bot.     | • Heavy Python web deps (Flask/Quart/Sanic).          |
|                   | • Third-party cog/repo marketplace UI.      | • Slow page render speeds, clunky UI.                 |
|                   | • Live ANSI color log tail streaming.       |                                                       |
+-------------------+---------------------------------------------+-------------------------------------------------------+
| YAGPDB            | • Ace Editor for custom command scripting.  | • Outdated Bootstrap 4 visual styling.                |
|                   | • Hierarchical automod ruleset engine.      | • Monolithic Go server tightly coupled to bot.        |
|                   | • Shard orchestrator health matrix.         |                                                       |
+-------------------+---------------------------------------------+-------------------------------------------------------+
| Sapphire / Skyra  | • Developer-first glassmorphism dark UI.    | • Complex client-side SPA hydration bundles.          |
|                   | • Clean command & plugin card components.   |                                                       |
|                   | • High-contrast dark-first color palette.   |                                                       |
+-------------------+---------------------------------------------+-------------------------------------------------------+
| ProBot / Carl.gg  | • 1:1 WYSIWYG Discord Embed Builder.        | • Core features paywalled behind subscriptions.       |
|                   | • Variable placeholder chip autocomplete.   | • Cluttered, overwhelming navigation menus.           |
|                   | • Multi-tag audit log search & filters.     |                                                       |
+-------------------+---------------------------------------------+-------------------------------------------------------+
| TicketTool / MEE6 | • Interactive Discord Button/Menu builders. | • Aggressive subscription upsells.                    |
|                   | • Persistent floating unsaved state bar.    | • Slow form save feedback and SPA lag.                |
|                   | • Drag-and-drop embed field reordering.     |                                                       |
+-------------------+---------------------------------------------+-------------------------------------------------------+
| Dyno              | • Dashboard-action audit trail tracking.    | • No real-time updates, full-page reloads required.   |
|                   | • Server banner hero headers.               |                                                       |
+-------------------+---------------------------------------------+-------------------------------------------------------+
```

### Key Architectural Decisions from Research

1. **Decoupled RPC (from Red-DiscordBot)**
   - *Why*: HTTP traffic and Discord Gateway heartbeats must never share the same event loop.
   - *How*: `apps/dashboard` → RabbitMQ `RpcRequest` → `apps/worker` handler → `RpcResponse`. The bot worker processes all Discord state queries; the web server only renders HTML and proxies RPC calls.

2. **Channel/Role Override Ruleset Engine (from YAGPDB)**
   - *Why*: Admins need fine-grained per-channel and per-role config exceptions without code changes.
   - *How*: `ModuleConfigOverride` Prisma model + RPC actions `guild.config.override.set` / `guild.config.override.delete`.

3. **WYSIWYG Embed Builder (from ProBot & TicketTool)**
   - *Why*: Server admins cannot mentally visualize raw JSON embed structures.
   - *How*: Split-pane editor — left side form inputs, right side a live `@skyra/discord-components`-style CSS rendering of the exact Discord message layout.

4. **Persistent Floating Save Bar (from MEE6 & TicketTool)**
   - *Why*: Users accidentally lose config changes when navigating between modules.
   - *How*: Vanilla JS dirty-state detection triggers a sticky bottom bar with `Cmd+S` shortcut and route-change guards.

5. **Developer Glassmorphism Dark UI (from Sapphire / Vercel / Linear)**
   - *Why*: Self-hosted Discord bot dashboards are used by technically-minded server owners who expect premium tooling aesthetics.
   - *How*: Lumi's brand electric cyan palette + glassmorphic backdrop blurs + `⌘K` Spotlight search modal.

---

## 3. Technology Stack & Architectural Justifications

```
   ┌──────────────────────────────────────────────────────────────────────────────┐
   │                            LUMI TECH STACK                                   │
   ├───────────────────┬──────────────────────────────┬───────────────────────────┤
   │ Layer             │ Technology                   │ Why                       │
   ├───────────────────┼──────────────────────────────┼───────────────────────────┤
   │ Runtime & HTTP    │ Bun 1.2+ (Bun.serve)         │ Native TS, <2ms SSR,      │
   │                   │                              │ 100k+ req/sec, 30MB RAM.  │
   ├───────────────────┼──────────────────────────────┼───────────────────────────┤
   │ CSS & Styling     │ Vanilla CSS3 Custom Props    │ Zero build pipeline, GPU  │
   │                   │ + backdrop-filter blurs      │ accelerated glow effects. │
   ├───────────────────┼──────────────────────────────┼───────────────────────────┤
   │ RPC Message Bus   │ RabbitMQ (amqplib)           │ Async decoupler — web     │
   │                   │                              │ cannot block bot process. │
   ├───────────────────┼──────────────────────────────┼───────────────────────────┤
   │ Persistence       │ PostgreSQL 17 + Prisma ORM   │ ACID logs, full-text      │
   │                   │                              │ search via pg_trgm.       │
   ├───────────────────┼──────────────────────────────┼───────────────────────────┤
   │ Cache & Pub/Sub   │ Redis 7 (ioredis)            │ Session store + sharding  │
   │                   │                              │ heartbeat pub/sub bus.    │
   ├───────────────────┼──────────────────────────────┼───────────────────────────┤
   │ Session Security  │ HMAC-SHA256 signed cookies   │ Tamper-proof, HttpOnly,   │
   │                   │ (DASHBOARD_SESSION_SECRET)   │ SameSite=Lax.             │
   └───────────────────┴──────────────────────────────┴───────────────────────────┘
```

### Why `Bun.serve` over Express / Next.js / Fastify

| | Bun.serve | Express | Next.js |
|---|---|---|---|
| Cold start | ~5ms | ~200ms | ~800ms |
| Memory footprint | ~28MB | ~60MB | ~150MB+ |
| TypeScript support | Native, zero config | Requires ts-node/esbuild | Requires build step |
| SSR response time | <2ms | ~15ms | ~50ms (hydration) |
| Bundle size | 0 bytes (SSR only) | N/A | 80KB+ client bundle |

### Why Vanilla CSS over Tailwind

- Tailwind requires a constant `--watch` build process to purge unused classes.
- Vanilla CSS custom properties (`var(--accent-cyan)`) allow runtime theme switching without rebuilds.
- `backdrop-filter: blur(16px)` and radial gradient glows are native CSS — no Tailwind plugin needed.

---

## 4. Public Landing Page & Home View (`/`) Specification

When an unauthenticated user hits the root domain, serve a marketing landing page — not a redirect to login.

**Why**: First impressions convert visitors into bot adopters. YAGPDB and Dyno both miss this — they redirect immediately to OAuth2 login, losing cold traffic.

```
+-----------------------------------------------------------------------------------+
| LUMI PUBLIC LANDING PAGE                                                         |
+-----------------------------------------------------------------------------------+
| ✦ Lumi    Features   Modules   Docs   Status          [Add to Discord] [Login]   |
+-----------------------------------------------------------------------------------+
|                  ● LUMI IS ONLINE — 99.99% UPTIME (LAST 30 DAYS)                 |
|                                                                                   |
|               ✦ NEXT-GENERATION DISCORD SERVER GOVERNANCE                         |
|        Modular · Anti-Nuke · Dynamic Voice · Permit-Based · Zero Latency         |
|                                                                                   |
|   [🤖 Add Lumi to Discord]      [📊 Open Dashboard]      [📜 Read the Docs]      |
|                                                                                   |
+-----------------------------------------------------------------------------------+
| LIVE STATS (pulled from Global record + sharding telemetry):                     |
|   ████ 14,280 Members Managed  │  389 Threats Neutralized  │  18 Active VCs      |
+-----------------------------------------------------------------------------------+
| FEATURE HIGHLIGHT CARDS (6-card grid):                                           |
|                                                                                   |
|   🛡️ Anti-Nuke & Wick Permits      🔊 Temp Voice Channels                        |
|   🚨 Auto-Mod Heat Filters          ⚙️  Granular Node Permits                    |
|   🧩 Addon Marketplace              📊 Config History & Rollback                  |
|                                                                                   |
+-----------------------------------------------------------------------------------+
| COMPETITIVE MATRIX:                                                              |
|  Feature                │ Lumi        │ MEE6        │ Dyno        │ YAGPDB      |
|  100% Self-Hosted Free  │ ✅          │ ❌ $12/mo   │ ❌ $5/mo   │ ✅          |
|  Anti-Nuke Panic Mode   │ ✅ Instant  │ ❌ Basic    │ ❌ Paid    │ ❌ None     |
|  Temp VC Generator      │ ✅ Built-in │ ❌ Paid     │ ❌ None    │ ❌ None     |
|  Config Rollback        │ ✅ Full log │ ❌ None     │ ❌ None    │ ❌ None     |
|  Sub-2ms Dashboard SSR  │ ✅ Bun.serve│ ❌ SPA lag  │ ❌ Slow    │ ⚠️ Medium  |
+-----------------------------------------------------------------------------------+
| FOOTER:  GitHub · Docs · Support Server · Privacy Policy · Status Page           |
+-----------------------------------------------------------------------------------+
```

---

## 5. Security Architecture & Threat Vulnerability Mitigations

Lumi enforces **7 strict defense layers** against OWASP Top 10, session hijacking, privilege escalation, and OAuth2 token theft.

### Threat Model Grid

```
┌─────────────────────────┬──────────────────────────────────────┬──────────────────────────────────────┐
│ Vulnerability           │ Exploit Scenario                     │ Lumi Mitigation                      │
├─────────────────────────┼──────────────────────────────────────┼──────────────────────────────────────┤
│ IDOR / Broken Access    │ Attacker changes /guild/101 to       │ authorizedGuild(session, guildId)    │
│ Control (OWASP A01)     │ /guild/999 to steal server settings. │ re-verified server-side on EVERY     │
│                         │                                      │ request. Returns 403 if invalid.     │
├─────────────────────────┼──────────────────────────────────────┼──────────────────────────────────────┤
│ Bot Owner Privilege     │ Regular server owner accesses        │ session.isBotOwner === true check    │
│ Escalation              │ /system or /api/system/* routes.     │ enforced on EVERY system route.      │
├─────────────────────────┼──────────────────────────────────────┼──────────────────────────────────────┤
│ XSS — Stored/Reflected  │ Attacker injects <script> in a guild │ All dynamic values (names, reasons,  │
│ (OWASP A03)             │ name or warn reason to steal admin   │ channels) passed through escapeHtml() │
│                         │ session cookies.                     │ before string interpolation. CSP set. │
├─────────────────────────┼──────────────────────────────────────┼──────────────────────────────────────┤
│ CSRF                    │ Malicious site POSTs to              │ Signed CSRF token embedded in every  │
│ (OWASP A01)             │ /api/guild/101/config to change bot  │ form. Validated on all state-mutating │
│                         │ settings while admin is logged in.   │ POST/DELETE requests. SameSite=Lax.  │
├─────────────────────────┼──────────────────────────────────────┼──────────────────────────────────────┤
│ OAuth2 Login CSRF       │ Attacker tricks victim into linking  │ Cryptographically random state param  │
│ & State Injection       │ attacker's Discord account via       │ generated, stored in cookie, verified │
│                         │ crafted /callback URL.               │ on callback before token exchange.    │
├─────────────────────────┼──────────────────────────────────────┼──────────────────────────────────────┤
│ Session Hijacking &     │ Attacker reads or forges session     │ HMAC-SHA256 cookie signing using      │
│ Cookie Tampering        │ cookie to impersonate admin user.    │ DASHBOARD_SESSION_SECRET. HttpOnly,   │
│                         │                                      │ Secure flags. 7-day max TTL.          │
├─────────────────────────┼──────────────────────────────────────┼──────────────────────────────────────┤
│ Rate Limiting & DoS     │ Attacker floods /callback or API     │ Sliding-window per-IP rate limiter   │
│                         │ endpoints to exhaust Bun threads.    │ in Bun.serve fetch handler.          │
├─────────────────────────┼──────────────────────────────────────┼──────────────────────────────────────┤
│ RPC Payload Injection   │ Attacker crafts malicious JSON into  │ TypeScript interface enforcement +    │
│                         │ a RabbitMQ RPC wire request.         │ Zod schema validation before every   │
│                         │                                      │ RPC dispatch.                        │
└─────────────────────────┴──────────────────────────────────────┴──────────────────────────────────────┘
```

### Security Implementation Details

**A. HTML Entity Encoding (XSS Prevention)**

Every dynamic value rendered inside template literal HTML strings **must** go through `escapeHtml()`:

```typescript
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

// Usage inside views.ts:
// <span>${escapeHtml(session.username)}</span>  ✅
// <span>${session.username}</span>              ❌ XSS risk
```

**B. Server-Side IDOR Guard**

```typescript
function authorizedGuild(session: Session, guildId: string): boolean {
  return session.guilds.some((g) => g.id === guildId && canManage(g));
}

// Applied to every /guild/:guildId route and /api/guild/:guildId/* endpoint:
if (!authorizedGuild(session, guildId)) {
  return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
}
```

**C. HTTP Security Headers (applied to every response)**

```typescript
const SECURITY_HEADERS: Record<string, string> = {
  "Content-Security-Policy":
    "default-src 'self'; img-src 'self' https://cdn.discordapp.com data:; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src 'self' https://fonts.gstatic.com; script-src 'self' 'unsafe-inline';",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};
```

**D. OAuth2 State Parameter Verification**

```typescript
// On /login: generate and store state cookie
const state = crypto.randomUUID();
headers.append("Set-Cookie", `oauth_state=${state}; HttpOnly; SameSite=Lax; Max-Age=300`);

// On /callback: verify state matches before token exchange
const cookieState = parseCookies(req).oauth_state;
const queryState = url.searchParams.get("state");
if (!cookieState || cookieState !== queryState) {
  return new Response("Invalid OAuth2 state", { status: 403 });
}
```

**E. Session Cookie Hardening**

- Signed with `DASHBOARD_SESSION_SECRET` via HMAC-SHA256.
- Flags: `HttpOnly; Secure; SameSite=Lax; Max-Age=604800` (7 days).
- Never stored in `localStorage` or querystring parameters.

**F. Rate Limiting (per-IP sliding window)**

```typescript
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function rateLimit(ip: string, limit = 30, windowMs = 60_000): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip) ?? { count: 0, resetAt: now + windowMs };
  if (now > entry.resetAt) { entry.count = 0; entry.resetAt = now + windowMs; }
  entry.count++;
  rateLimitMap.set(ip, entry);
  return entry.count > limit;
}
```

Applied to `/callback` (max 10/min), `/api/*` (max 60/min per IP).

---

## 6. Advanced Enterprise Extensions & High-Availability Features

### A. Web Dashboard i18n Engine

- Locale is derived from: `session.locale` → `Accept-Language` header → fallback `en-US`.
- All navigation labels, form field descriptions, error messages, and button text are translatable.
- Supported languages: `en-US`, `es-ES`, `pt-BR`, `sv-SE`, `zh-CN`, `zh-TW`, `cs`, `da`, `de`, `el` (matching Lumi's existing i18n files in `packages/core/src/languages/`).

### B. Real-Time WebSocket Engine (`/api/ws`)

Bi-directional WebSocket stream for live updates without page refreshes:

- **Live Shard Latency Tickers**: Cluster ping values update in the header every 5 seconds.
- **Mod Case Toast Notifications**: Instant browser notification when auto-mod or a moderator takes action.
- **Active Temp VC Monitor**: Members joining/leaving/locking temp VCs update the grid live.

Implementation: Bun's native `Bun.serve({ websocket: { ... } })` WebSocket handler with per-guild subscription rooms.

### C. Progressive Web App (PWA)

- `manifest.json` with Lumi brand colors and icons enables "Install App" on iOS, Android, and desktop Chrome.
- Mobile responsive: sidebar collapses to a slide-over drawer below 768px viewport width.
- Offline page: custom branded offline fallback served via service worker when RabbitMQ is unreachable.

### D. One-Click Config Backup & Restore

- **Export**: Serializes `Guild`, `GuildModuleState`, `GuildModuleConfig`, `WarnThreshold`, `ModuleConfigOverride`, `CustomPermit`, and `EnforcedPermit` records for a guild into a portable `lumi-config-{guildId}.json` file, downloadable from the dashboard.
- **Import**: Upload a previously exported config file to restore all settings instantly — useful when moving Lumi to a new server or cloning configuration across multiple servers.

### E. Multi-Theme Engine

| Theme Name | Background | Primary Accent | Secondary Accent |
|---|---|---|---|
| Midnight Space (default) | `#04060c` | `#38bdf8` (cyan) | `#6366f1` (indigo) |
| OLED Pitch Black | `#000000` | `#38bdf8` (cyan) | `#8b5cf6` (violet) |
| Cyberpunk Neon | `#090a0f` | `#ec4899` (pink) | `#06b6d4` (cyan) |

Theme selection stored in `localStorage` and applied via a `data-theme` attribute on `<html>`.

---

## 7. Lumi Brand Aesthetic & Design System

Palette extracted directly from `assets/banner.png`:

```css
:root {
  /* Canvas & Surfaces */
  --bg-canvas:      #04060c;
  --bg-card:        rgba(13, 15, 24, 0.75);
  --bg-card-hover:  rgba(22, 25, 38, 0.85);

  /* Brand Accents */
  --accent-cyan:    #38bdf8;
  --accent-blue:    #00a8ff;
  --accent-violet:  #6366f1;
  --accent-purple:  #8b5cf6;

  /* Status Colours */
  --status-success: #10b981;
  --status-warning: #f59e0b;
  --status-danger:  #f43f5e;

  /* Borders & Glows */
  --border:         rgba(255, 255, 255, 0.08);
  --border-glow:    rgba(0, 168, 255, 0.35);
  --glow-radial:    radial-gradient(circle at 50% 0%, rgba(56,189,248,0.15), transparent 70%);

  /* Typography */
  --font-brand:     'Outfit', sans-serif;
  --font-sans:      'Plus Jakarta Sans', 'Inter', sans-serif;
  --font-mono:      'JetBrains Mono', monospace;
}
```

### Layout Structure

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  STICKY HEADER                                                               │
│  [✦ Lumi]   [Search settings & modules...  ⌘K]   [● Cluster 01 • 14ms]     │
│                                              [Avatar: AlexDev]  [Logout]    │
├──────────┬───────────────────────────────────────────────────────────────────┤
│ MODULE   │  MAIN CONTENT CANVAS                                              │
│ SIDEBAR  │                                                                   │
│          │  Stats Grid (4 cards):                                            │
│ [🛡️ Mod] │  [Total Members] [Mod Cases] [Threats] [Active VCs]              │
│ [🔐 Sec] │                                                                   │
│ [🔊 TVC] │  Server Header:                                                   │
│ [🚨 Flt] │  [Server Icon] Server Name  ID                                    │
│ [📋 Log] │                                                                   │
│          │  Module Config Area:                                               │
│          │  [Module Emoji + Title + Toggle]                                  │
│          │  [Config Field Cards...]                                           │
│          │                                                                   │
├──────────┴───────────────────────────────────────────────────────────────────┤
│  FLOATING SAVE BAR (appears on unsaved changes)                              │
│  ⚠️ Careful — you have unsaved changes!   [Reset]   [Save Changes  ⌘S]      │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 8. Multi-Tier Permission & Role Architecture

```
                    ┌─────────────────────────────────────────┐
                    │          Discord OAuth2 Login           │
                    └────────────────────┬────────────────────┘
                                         │
                   Is user's ID in BOT_OWNERS env array?
                                    /         \
                                 YES            NO
                                /                \
  ┌──────────────────────────────────┐   ┌──────────────────────────────────┐
  │  Bot Owner System Panel          │   │  Server Owner Guild Panel        │
  │  Route: /system                  │   │  Route: /guild/:guildId          │
  ├──────────────────────────────────┤   ├──────────────────────────────────┤
  │ Global maintenance mode toggle   │   │ Server analytics stats grid      │
  │ Global module kill-switch grid   │   │ Guild module enable/disable      │
  │ Addon Git repo marketplace       │   │ Dynamic module config forms      │
  │ Global user/guild blocklist      │   │ Interactive Embed Builder        │
  │ Multi-cluster sharding matrix    │   │ Moderation case manager          │
  │ System audit ledger stream       │   │ Warn threshold rule editor       │
  │ GDPR user data delete console    │   │ Security panic lockdown          │
  └──────────────────────────────────┘   │ Verification panel builder       │
                                         │ Temp VC generator & live grid    │
                                         │ Channel/role override matrix     │
                                         │ Custom permit node tree          │
                                         │ Settings history & rollback      │
                                         │ Guild audit log search           │
                                         └──────────────────────────────────┘
```

---

## 9. Exhaustive Database Model to UI Component Mapping

All 24 models from `prisma/schema.prisma` mapped to dashboard UI components:

### A. Bot Owner System Panel (`/system`)

| Model | Key Fields | UI Component | Notes |
|---|---|---|---|
| `Global` | `botName`, `defaultPrefix`, `maintenanceMode`, `maintenanceMessage`, `inviteUrl`, `supportGuildId` | **SystemGlobalConfigCard** | Maintenance toggle + custom downtime message input. |
| `GlobalModuleState` | `moduleName`, `enabled`, `reason` | **GlobalModuleKillSwitchGrid** | Force-disable any module across all guilds instantly. |
| `DownloaderRepo` | `name`, `url`, `branch`, `commit` | **AddonGitRepoManagerTable** | Add/remove third-party addon repositories. |
| `DownloaderModule` | `repoId`, `moduleName`, `version`, `pinned` | **InstalledAddonsGrid** | Install/uninstall/pin addon modules. |
| `Blocklist` (global) | `userId`, `reason`, `blockedBy` (where `guildId IS NULL`) | **GlobalBlocklistTable** | Bot-wide ban list. |
| `AuditLedger` (system) | `userId`, `action`, `platform`, `details` | **SystemAuditStreamConsole** | Searchable all-guild admin action feed. |
| `User` | `id`, `moderationDM`, `locale` | **SystemUserPrivacyConsole** | Lookup user prefs + trigger GDPR deletion. |
| Shard telemetry | Shard ID, latency, guild count | **ClusterShardingTelemetryGrid** | Live Redis sharding matrix. |

### B. Server Owner Guild Panel (`/guild/:guildId`)

| Model | Key Fields | UI Component | Notes |
|---|---|---|---|
| `Guild` | `prefix`, `modRoleId`, `adminRoleId`, `modLogChannelId`, `muteRoleId`, `locale`, `timezone`, `noMentionSpamWindowMs`, `noMentionSpamLimit` | **GuildGeneralSettingsCard** | Core server configuration. |
| `GuildModuleState` | `moduleName`, `enabled` | **GuildModuleToggleSidebar** | Per-server module on/off switches. |
| `GuildModuleConfig` | `moduleName`, `configKey`, `value` | **DynamicConfigFormEditor** | Channel pickers, role selectors, booleans, numbers. |
| `ModerationCase` + `GuildCaseCounter` | `caseNumber`, `userId`, `moderatorId`, `action`, `reason`, `duration`, `active` | **ModerationCaseManagerTable** | View, search, filter, revoke mod cases. |
| `WarnThreshold` | `warnCount`, `action`, `duration` | **WarnThresholdRulesEditor** | Auto-escalation rules (3 warns → mute, 5 warns → ban). |
| `PanicState` | `invitesPaused`, `lockedChannels`, `startedAt` | **PanicModeLockdownWidget** | Instant raid response lockdown button. |
| `VerificationPanel` | `channelId`, `messageId` | **VerificationPanelCard** | Deploy button/captcha verification panels. |
| `TempVcGenerator` | `channelId`, `name`, `limit` | **TempVcGeneratorsManager** | Configure join-to-create channel templates. |
| `TempVcRecord` | `channelId`, `ownerId`, `name`, `locked`, `hidden` | **ActiveTempVcMonitorGrid** | Live voice channel state with admin override controls. |
| `ModuleConfigOverride` | `moduleName`, `key`, `modelType`, `modelId`, `value` | **ChannelRoleOverridesMatrix** | Per-channel or per-role config exceptions. |
| `EnforcedPermit` | `targetType`, `targetId`, `permit` | **EnforcedPermitsTable** | Un-quarantinable admin/mod system permits. |
| `CustomPermit` | `targetType`, `targetId`, `permit` | **CustomPermitsNodeTree** | Fine-grained Wick-style node permits (`mod.ban`, `tempvc.claim`). |
| `Blocklist` (guild) | `userId`, `reason`, `blockedBy` (where `guildId IS NOT NULL`) | **GuildBlocklistTable** | Server-specific bot blacklist. |
| `IgnoreEntry` | `channelId` | **IgnoredChannelsList** | Channels where Lumi ignores all commands. |
| `AfkEntry` | `userId`, `reason`, `since` | **AfkMemberListTable** | Live AFK member list. |
| `ModuleConfigHistory` | `moduleName`, `key`, `oldValue`, `newValue`, `actorId`, `createdAt` | **SettingsHistoryRollbackTable** | Full change log with 1-click rollback. |
| `AuditLedger` | `userId`, `action`, `platform`, `details` | **GuildAuditLogTable** | Filtered audit log with red/green diff viewer. |
| `ModuleData` | `moduleName`, `targetId`, `key`, `value` | **ModuleDataKVInspector** | Raw module dynamic state inspector. |

---

## 10. Complete RPC Protocol & Action Contracts

New contracts to add to `packages/contracts/src/rpc.ts`:

```typescript
// Payload interfaces
export interface SystemMaintenancePayload {
  maintenanceMode: boolean;
  maintenanceMessage?: string;
}

export interface SystemModuleTogglePayload {
  moduleName: string;
  enabled: boolean;
  reason?: string;
}

export interface GuildWarnThresholdPayload {
  warnCount: number;
  action: string;       // "mute" | "kick" | "ban" | "quarantine"
  duration?: string;    // e.g. "1h", "7d"
}

export interface GuildPermitPayload {
  targetType: "role" | "user";
  targetId: string;
  permit: string;       // e.g. "mod.ban", "tempvc.claim"
}

export interface GuildPanicTogglePayload {
  enabled: boolean;
}

export interface GuildConfigOverridePayload {
  moduleName: string;
  key: string;
  modelType: "channel" | "role" | "category";
  modelId: string;
  value: unknown;
}

// Expanded RPC_ACTIONS
export const RPC_ACTIONS = {
  // Existing
  gdprDelete:            "global.gdpr.delete",
  repoAdd:               "downloader.repo.add",
  repoList:              "downloader.repo.list",
  repoModules:           "downloader.repo.modules",
  moduleInstall:         "downloader.module.install",
  moduleUninstall:       "downloader.module.uninstall",
  guildDashboardGet:     "guild.dashboard.get",
  guildModuleToggle:     "guild.module.toggle",
  guildConfigSet:        "guild.config.set",

  // New — System Admin
  systemDashboardGet:    "system.dashboard.get",
  systemMaintenanceSet:  "system.maintenance.set",
  systemModuleToggle:    "system.module.toggle",
  systemRepoRemove:      "system.repo.remove",

  // New — Guild Moderation
  guildCasesList:        "guild.cases.list",
  guildCaseRevoke:       "guild.case.revoke",
  guildWarnThreshSet:    "guild.warn_thresholds.set",
  guildWarnThreshDelete: "guild.warn_thresholds.delete",

  // New — Guild Security
  guildPanicToggle:      "guild.panic.toggle",
  guildPermitsSet:       "guild.permits.set",
  guildPermitsRemove:    "guild.permits.remove",
  guildVerificationDeploy: "guild.verification.deploy",

  // New — Guild TempVC
  guildTempvcGeneratorAdd:    "guild.tempvc.generator.add",
  guildTempvcGeneratorRemove: "guild.tempvc.generator.remove",

  // New — Guild Config Overrides & History
  guildConfigOverrideSet:    "guild.config.override.set",
  guildConfigOverrideDelete: "guild.config.override.delete",
  guildConfigHistoryList:    "guild.config.history.list",
  guildConfigRollback:       "guild.config.rollback",

  // New — Audit & Misc
  guildAuditList:  "guild.audit.list",
  systemAuditList: "system.audit.list",
} as const satisfies Record<string, string>;
```

---

## 11. REST API Endpoints Specification

All endpoints in `apps/dashboard/src/server.ts`:

```
Method  Route                                       Auth                 Description
─────────────────────────────────────────────────────────────────────────────────────────
GET     /                                           Public / Session     Landing page (unauthed) or server picker (authed)
GET     /login                                      Public               Redirect to Discord OAuth2 authorize URL
GET     /callback                                   Public               Exchange OAuth2 code, set session cookie
GET     /logout                                     Session              Destroy session, redirect to /
GET     /system                                     Session + BotOwner   Bot Owner system administration panel
GET     /guild/:guildId                             Session + GuildAdmin Guild configuration dashboard

─── Bot Owner System API ────────────────────────────────────────────────────────────────
POST    /api/system/maintenance                     Session + BotOwner   Toggle global maintenance mode
POST    /api/system/module                          Session + BotOwner   Force-enable/disable module globally
POST    /api/system/repo/add                        Session + BotOwner   Add new addon Git repository
DELETE  /api/system/repo/:id                        Session + BotOwner   Remove addon Git repository
POST    /api/system/module/install                  Session + BotOwner   Install module from repo
POST    /api/system/module/uninstall                Session + BotOwner   Uninstall module
POST    /api/system/blocklist                       Session + BotOwner   Add user to global blocklist
DELETE  /api/system/blocklist/:userId               Session + BotOwner   Remove user from global blocklist
POST    /api/system/gdpr/delete                     Session + BotOwner   Trigger GDPR user data purge

─── Server Owner Guild API ──────────────────────────────────────────────────────────────
POST    /api/guild/:guildId/module                  Session + GuildAdmin Toggle module for guild
POST    /api/guild/:guildId/config                  Session + GuildAdmin Set module config key/value

POST    /api/guild/:guildId/warn-thresholds         Session + GuildAdmin Create/update warn threshold rule
DELETE  /api/guild/:guildId/warn-thresholds/:count  Session + GuildAdmin Delete warn threshold

POST    /api/guild/:guildId/panic/toggle            Session + GuildAdmin Toggle panic lockdown mode
POST    /api/guild/:guildId/verification/deploy     Session + GuildAdmin Deploy verification panel

POST    /api/guild/:guildId/permits                 Session + GuildAdmin Grant custom/enforced permit
DELETE  /api/guild/:guildId/permits/:id             Session + GuildAdmin Revoke permit

POST    /api/guild/:guildId/tempvc/generator        Session + GuildAdmin Add temp VC generator
DELETE  /api/guild/:guildId/tempvc/generator/:id    Session + GuildAdmin Remove temp VC generator

POST    /api/guild/:guildId/blocklist               Session + GuildAdmin Add user to guild blocklist
DELETE  /api/guild/:guildId/blocklist/:userId       Session + GuildAdmin Remove user from guild blocklist

POST    /api/guild/:guildId/override                Session + GuildAdmin Set channel/role config override
DELETE  /api/guild/:guildId/override/:id            Session + GuildAdmin Delete config override

GET     /api/guild/:guildId/config/history          Session + GuildAdmin Fetch config change history
POST    /api/guild/:guildId/config/rollback         Session + GuildAdmin Rollback to previous config state

GET     /api/guild/:guildId/audit                   Session + GuildAdmin Fetch guild audit log entries
GET     /api/system/audit                           Session + BotOwner   Fetch system-wide audit log
```

---

## 12. Step-by-Step Implementation Guide

### Phase 1 — RPC Contracts (`packages/contracts/src/rpc.ts`)

1. Add all new payload interfaces listed in Section 10.
2. Expand `RpcRequestPayloads` map with new action → payload type bindings.
3. Expand `RPC_ACTIONS` const object with new action strings.
4. Run `bun run typecheck` — zero errors expected.

### Phase 2 — Dashboard Config & Session Types (`apps/dashboard/src`)

1. **`config.ts`**: Parse `BOT_OWNERS` from env:
   ```typescript
   botOwners: envParseString("BOT_OWNERS", "").split(",").filter(Boolean),
   ```
2. **`types.ts`**: Add `isBotOwner: boolean` to `Session` interface. Add `SystemDashboardData` type for system panel RPC response.

### Phase 3 — Server Routes & Middleware (`apps/dashboard/src/server.ts`)

1. Add `SECURITY_HEADERS` to every response via a shared helper.
2. Add `rateLimit()` call at the top of the fetch handler.
3. Update `/callback` to set `session.isBotOwner = config.botOwners.includes(user.id)`.
4. Add `GET /system` route: guard with `if (!session.isBotOwner) return redirect("/")`.
5. Implement all `/api/system/*` routes (section 11).
6. Implement all new `/api/guild/:guildId/*` routes (section 11).

### Phase 4 — Views & Design Tokens (`apps/dashboard/src/views.ts`)

1. Replace current CSS token block with the full Lumi brand token set (Section 7).
2. Implement `landingPage(stats)` — public hero page for unauthenticated visitors.
3. Implement `systemDashboardPage(session, data)` — Bot Owner system admin panel.
4. Add `escapeHtml()` function and wrap **all** dynamic interpolated values.
5. Implement the floating save bar HTML + vanilla JS dirty-state detection script.
6. Implement `⌘K` spotlight search modal HTML + keyboard event listener.

### Phase 5 — Verification

```bash
# Typecheck entire monorepo
bun run typecheck

# Unit tests
bun test

# Boot mock dashboard and screenshot all views
nix-shell --option binary-caches "https://cache.nixos.org" -p bun chromium --run '
  BOT_OWNERS=123456789012345678 \
  DISCORD_OAUTH2_CLIENT_ID=123 \
  DISCORD_OAUTH2_CLIENT_SECRET=secret \
  DISCORD_OAUTH2_REDIRECT_URI=http://localhost:3000/callback \
  RABBITMQ_URL=amqp://guest:guest@localhost:5672 \
  DASHBOARD_SESSION_SECRET=secretsecretsecretsecretsecret32 \
  bun /home/rebiz/.gemini/antigravity-cli/brain/372e6bbd-f2c3-48cb-97de-d86b008f4d99/scratch/mock_dashboard_server.ts &
  SERVER_PID=$!
  sleep 2
  chromium --headless=new --no-sandbox --window-size=1400,900  --screenshot=dashboard_landing.png  "http://localhost:8888/login"
  chromium --headless=new --no-sandbox --window-size=1400,1100 --screenshot=dashboard_system.png   "http://localhost:8888/system"
  chromium --headless=new --no-sandbox --window-size=1400,1100 --screenshot=dashboard_guild.png    "http://localhost:8888"
  kill $SERVER_PID
'

xdg-open dashboard_landing.png
xdg-open dashboard_system.png
xdg-open dashboard_guild.png
```
