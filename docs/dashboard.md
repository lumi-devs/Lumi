# Dashboard

Reference for `apps/dashboard` - the Next.js (App Router) web administration panel. For where the dashboard sits in the wider system, see [Architecture § Dashboard Frontend](architecture.md#dashboard-frontend); for the environment variables it reads, see [Configuration Reference § Dashboard](configuration.md#dashboard).

## Hard boundaries

Three rules define the app, and everything below follows from them:

1. **The dashboard never opens a Postgres or Redis connection.** There is no Prisma client, no `ioredis` import, no connection string other than `RABBITMQ_URL`. Every read and every write is a RabbitMQ RPC call to `apps/worker`, which owns the database.
2. **The dashboard never holds the Discord bot token.** It holds OAuth2 *application* credentials (`DISCORD_OAUTH2_CLIENT_ID` / `_SECRET`) so users can sign in as themselves, and nothing more. Anything that needs the bot's identity is done by the worker on the other end of an RPC call.
3. **Nothing that talks to RabbitMQ is reachable from the browser.** `src/lib/rpc.ts`, `src/lib/env.ts`, `src/lib/auth.ts`, `src/lib/auth-guards.ts`, `src/lib/dashboard-fetch.ts` and `src/lib/rate-limit.ts` all start with `import "server-only"`, which makes importing them from a Client Component a build-time error.

The practical payoff is isolation: a dashboard outage, a traffic spike, or a slow page render cannot affect Discord gateway latency, because the two never share a process or an event loop.

## App Router structure

```
src/
  app/                  Routes (see inventory below)
  actions/              Server Actions - the mutation path, one file per domain
  components/
    ui/                 Primitives: button, card, table, input, switch, badge, alert,
                        empty-state, page-header, glyph
    layout/             Chrome: site-header, guild-sidebar, system-sidebar, nav-item,
                        command-palette, theme-toggle, wordmark
    guild/  system/  account/   Feature components for each route group
  lib/                  auth.ts, auth-guards.ts, rpc.ts, dashboard-fetch.ts,
                        dashboard-data.ts, env.ts, discord.ts, rate-limit.ts,
                        guild-nav.ts, permit-nodes.ts, action-result.ts,
                        use-server-action.ts, utils.ts
  middleware.ts         Per-request CSP nonce
  instrumentation.ts    Next's server-boot hook - OTel, Prometheus, readiness probe
  types/next-auth.d.ts  Session/JWT module augmentation
```

The `#/` import alias maps to `src/` (`tsconfig.json` paths), so imports read `#/lib/rpc`, `#/components/ui/button`.

### Route inventory

| Route | Guard | Purpose |
| :--- | :--- | :--- |
| `/` | none | Landing page when signed out, server picker when signed in. |
| `/login` | none | Branded sign-in screen. The "Continue with Discord" button is a Server Action calling NextAuth's `signIn("discord")`, rate limited to 10/min per IP. |
| `/api/auth/[...nextauth]` | none | NextAuth's catch-all route handler (`/signin`, `/callback/discord`, `/session`, `/signout`, `/csrf`). |
| `/account` | `requireSession` | Self-service GDPR export of the signed-in user's own data. |
| `/guild-picker` | session, else `/login` | Standalone server list, for switching servers from inside a guild. |
| `/guild/[guildId]` | `requireGuild` | General settings - prefix, mod/admin roles, mod-log and mute channels, locale, timezone, mention-spam limits, invite/support URLs. |
| `/guild/[guildId]/modules` | `requireGuild` | Per-guild module enable/disable grid. |
| `/guild/[guildId]/modules/[moduleName]` | `requireGuild` | Schema-driven config form for one module, generated from its `ConfigField[]`. |
| `/guild/[guildId]/permits` | `requireGuild` | Permit editor - create/update/delete permits, assign to roles or users. |
| `/guild/[guildId]/moderation` | `requireGuild` | Moderation case list and case revocation. |
| `/guild/[guildId]/warn-thresholds` | `requireGuild` | Escalating warn-count actions. |
| `/guild/[guildId]/security` | `requireGuild` | Panic mode and the verification panel. |
| `/guild/[guildId]/tempvc` | `requireGuild` | Temp-VC generators and live channel records. |
| `/guild/[guildId]/overrides` | `requireGuild` | Per-channel/role/user/category config overrides. |
| `/guild/[guildId]/history` | `requireGuild` | Settings-change history, with rollback. |
| `/guild/[guildId]/audit` | `requireGuild` | Guild audit log. |
| `/guild/[guildId]/blocklist` | `requireGuild` | Per-guild user blocklist. |
| `/guild/[guildId]/advanced` | `requireGuild` | Ignored channels, AFK entries, raw module data. |
| `/system` | `requireBotOwner` | Global config and maintenance mode. |
| `/system/modules` | `requireBotOwner` | Global module kill-switches. |
| `/system/addons` | `requireBotOwner` | Addon git repositories - add, list, install, uninstall. |
| `/system/blocklist` | `requireBotOwner` | Global user blocklist. |
| `/system/audit` | `requireBotOwner` | Cross-guild audit log. |
| `/system/users` | `requireBotOwner` | User privacy console - GDPR deletion. |
| `/system/shards` | `requireBotOwner` | Sharding telemetry. |

Every route above is built and RPC-wired. For a new one, the patterns to copy are `guild/[guildId]/modules/[moduleName]/page.tsx` (dynamic form + floating save bar), `guild/[guildId]/modules/page.tsx` (toggle grid), or `guild/[guildId]/moderation/page.tsx` (searchParams-driven filter + pagination).

The two sidebars are driven by shared link tables - `src/lib/guild-nav.ts` for the guild nav (also consumed by the command palette, so the two can't drift) and a module-scope constant in `src/components/layout/system-sidebar.tsx` for the system nav.

## The RPC bridge

`src/lib/rpc.ts` is the only outbound data path. It is a request/response client over RabbitMQ:

- Requests are published to the durable shared queue `lumi.rpc.requests`, which `apps/worker` consumes.
- Replies come back over RabbitMQ's `amq.rabbitmq.reply-to` pseudo-queue, so no per-call reply queue is ever created. Responses are correlated by a `randomUUID()` request id carried in `correlationId`.
- The default timeout is 8000 ms, overridable per call via `timeoutMs`.
- A non-`ok` response is rethrown as an `Error` carrying the worker's `error` string.

Wire types (`RpcRequest`, `RpcResponse`), the payload map (`RpcRequestPayloads`), and the action-name constants (`RPC_ACTIONS`) all live in `packages/contracts/src/rpc.ts` and are shared verbatim by both ends, so an action rename is a compile error on the caller side rather than a runtime 500.

Next.js has no long-lived `main.ts` bootstrap - Server Components, Route Handlers, and Server Actions are each invoked ad hoc by the framework. The AMQP connection is therefore a lazily created module-scope singleton cached on `globalThis`, which also stops `next dev` from opening a fresh connection on every hot reload.

`src/instrumentation.ts` (Next's documented server-boot hook) registers a `rabbitmq` readiness probe against that client, alongside the same OTel tracing and Prometheus metrics bootstrap every other Lumi service runs.

## RPC action surface

There are exactly 50 actions. The authoritative list is `RpcRequestPayloads` in `packages/contracts/src/rpc.ts`; each key is the wire action string and its value is the `data` payload the caller must send (`never` means the action takes no payload).

| Group | Actions |
| :--- | :--- |
| Auth (1) | `auth.whoami` |
| Global / GDPR (2) | `global.gdpr.delete`, `global.gdpr.export` |
| Addon downloader (5) | `downloader.repo.add`, `downloader.repo.list`, `downloader.repo.modules`, `downloader.module.install`, `downloader.module.uninstall` |
| Guild core (4) | `guild.dashboard.get`, `guild.module.toggle`, `guild.config.set`, `guild.settings.set` |
| Permits (6) | `guild.permits.list`, `.create`, `.update`, `.delete`, `.assign`, `.unassign` |
| Moderation (4) | `guild.cases.list`, `guild.cases.revoke`, `guild.warnThresholds.list`, `guild.warnThresholds.set` |
| Security (5) | `guild.panic.get`, `guild.panic.set`, `guild.verificationPanel.get`, `.set`, `.delete` |
| Temp VC (3) | `guild.tempvc.generators.list`, `guild.tempvc.generators.set`, `guild.tempvc.records.list` |
| Audit & history (3) | `guild.audit.list`, `guild.history.list`, `guild.history.rollback` |
| Overrides (2) | `guild.overrides.list`, `guild.overrides.set` |
| Guild blocklist (3) | `guild.blocklist.list`, `guild.blocklist.add`, `guild.blocklist.remove` |
| Guild advanced (5) | `guild.afk.list`, `guild.ignored.list`, `guild.ignored.add`, `guild.ignored.remove`, `guild.moduleData.list` |
| System (7) | `system.dashboard.get`, `system.maintenance.set`, `system.module.toggle`, `system.audit.list`, `system.blocklist.list`, `system.blocklist.add`, `system.blocklist.remove` |

Guild-scoped actions carry `guildId`; every action carries `actorId` so the worker can attribute the change in its audit log and re-check the caller's permits on its own side. The handler registrations are in `packages/core/src/lib/rpc/core-rpc.ts`.

## Read path vs. mutation path

The two are deliberately separate.

**Reads** go through `src/lib/dashboard-fetch.ts`, a thin typed layer over `rpcCall` that returns the view types declared in `src/lib/dashboard-data.ts`. Fetchers whose arguments are scalars (`getGuildDashboard`, `getGuildPermits`, `getGuildPanicState`, ...) are wrapped in `React.cache()`, giving per-request memoization: the guild layout renders the sidebar and the page renders its content, both calling `getGuildDashboard(guildId, actorId)`, but only one `guild.dashboard.get` round trip happens. Fetchers that take a filter object (`getGuildCases`, `getGuildAuditLog`, `getGuildConfigHistory`, `getGuildBlocklist`, `getGuildModuleData`, the system list fetchers) are intentionally *not* wrapped - `React.cache()` keys on argument identity, and a freshly constructed filter object never hits.

**Mutations** go through `src/actions/*-actions.ts`, one file per domain: `guild-actions`, `moderation-actions`, `security-actions`, `tempvc-actions`, `overrides-actions`, `history-actions`, `blocklist-actions`, `advanced-actions`, `system-actions`, `user-actions`, `auth-actions`. Every guild-scoped action independently calls `requireGuild(guildId)` and every system action calls `requireBotOwner()` before issuing its RPC - a layout guard only protects a page render, not a Server Action invoked directly. Each action is wrapped in `runAction()` (`src/lib/action-result.ts`), which normalizes a guard rejection or an RPC failure into `{ ok: false, error }` and re-throws Next's control-flow signals so a `redirect()` from an expired session still redirects instead of rendering as the string `"NEXT_REDIRECT"`. Successful mutations call `revalidatePath` so the affected Server Components re-render with fresh data.

CSRF is Next.js's built-in same-origin (Origin vs. Host) check on Server Actions. `experimental.serverActions.allowedOrigins` is deliberately left unset in `next.config.ts` so the check stays strictly same-origin; do not hand-roll a token system on top of it.

## Authentication & authorization

Auth is [NextAuth.js (Auth.js v5)](https://authjs.dev) with the Discord provider (`src/lib/auth.ts`). The library owns the authorization redirect, PKCE/state CSRF protection, and the code exchange.

- **Scope** is `identify guilds`, so the user's guild list can be fetched and filtered to those where they hold Manage Server (`canManage` in `src/lib/discord.ts`).
- **Sessions are JWTs**, signed and encrypted with `DASHBOARD_SESSION_SECRET`, with an 8-hour `maxAge`. There is no session table and no server-side session store.
- **`trustHost: true`** is set, because in every real deployment the app sits behind a reverse proxy or a container port mapping rather than on a fixed known host. Without it NextAuth throws `UntrustedHost` on every request.
- **The callback URL is derived from the request** - it is not configured by an environment variable. Register `https://<your-dashboard-host>/api/auth/callback/discord` under **OAuth2 → Redirects** on your Discord application. Behind a proxy that rewrites the host, set `AUTH_URL` to the externally visible origin.

### The authz cache

Two facts on the JWT are not from Discord's ID token and can go stale: `guilds` (which servers the user can manage) and `isBotOwner`. `refreshAuthorization()` re-derives both, but at most once per **5 minutes** (`AUTHZ_TTL_MS`). Short enough that losing Manage Server, or gaining bot-owner status, takes effect in minutes instead of lasting a full 8-hour session; long enough that a browsing user costs Discord one `/users/@me/guilds` call and the worker one `auth.whoami` RPC per 5 minutes rather than one per request.

A mutated JWT is only written back to the cookie in contexts that can set headers, and a plain Server Component render cannot. The timestamp on the token alone would therefore let every page view trigger another refresh, so the actual bound on outbound traffic is a process-local `Map` snapshot, published *before* the awaits so concurrent renders don't stampede and a persistently failing Discord or worker can't turn every request into a retry. Both refresh steps swallow their errors and keep the previously resolved value - clobbering `isBotOwner` to `false` would lock a real owner out of `/system` until their session expired, and an empty guild list would 404 every guild route with no recovery short of a manual sign-out.

`isBotOwner` comes from the `auth.whoami` RPC, which defers to the worker's `PermitResolver.isBotOwner`. That recognizes the Discord application's actual owner as well as `OWNER_IDS`, so there is no dashboard-side owner list and no dashboard env var to keep in sync.

### Guards

`src/lib/auth-guards.ts` exposes three, all `server-only`:

| Guard | Failure mode | Use |
| :--- | :--- | :--- |
| `requireSession()` | `redirect("/login")` | Any authenticated page. |
| `requireGuild(guildId)` | `notFound()` | Guild-scoped pages and every guild-scoped Server Action. |
| `requireBotOwner()` | `notFound()` | The `/system` tree and every system Server Action. |

`requireGuild` is the IDOR guard: authorization is re-derived from the session on the server on every render and every mutation, never trusted from client state, so editing `/guild/101` to `/guild/999` in the address bar - or crafting a direct Server Action call - reads and writes nothing. Both guilded and owner failures use `notFound()` rather than a 403, so the response never confirms that a route or a guild exists to someone not entitled to it. `apps/dashboard/tests/lib/auth-guards.test.ts` holds regression tests for both attacks.

`src/lib/rate-limit.ts` adds a per-process sliding-window limiter (`rate-limiter-flexible`, in-memory driver) used on the login flow. It is process-local and does not coordinate across dashboard replicas; swapping the driver for `RateLimiterRedis` would, but that is not wired up.

## Security headers and the CSP nonce

Static headers - `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Strict-Transport-Security`, `Permissions-Policy` - are applied to every response by `headers()` in `next.config.ts`.

The Content-Security-Policy is **not** there. It is built per request in `src/middleware.ts`, and it has to be, for a specific reason: Next only adds a nonce to its own inline RSC flight scripts (`self.__next_f.push(...)`) when it can read a `content-security-policy` header off the **incoming request**. A response header configured in `next.config.ts` is invisible to the renderer. Set a strict `script-src 'self'` that way and every flight script is blocked, so hydration never runs and the app is inert. Only middleware can mutate request headers, so only middleware can do this.

Each request gets 16 random bytes, base64-encoded into a nonce, which is written onto both the forwarded request headers and the outgoing response headers. The policy is `default-src 'self'` with `img-src` extended to `https://cdn.discordapp.com` (Discord user and guild icons) and `data:`, `style-src 'self' 'unsafe-inline'`, `frame-ancestors 'none'`, and `base-uri` / `form-action` pinned to `'self'`. In development only, `script-src` also allows `'unsafe-inline' 'unsafe-eval'` and `connect-src` allows `ws:`, which the dev overlay and hot reload need.

The middleware matcher skips `_next/static`, `_next/image`, and `favicon.ico`, and skips prefetch requests.

## Design tokens

`src/app/globals.css` is the single source of colour, type, and elevation. It defines semantic CSS custom properties on `:root` for light mode, then overrides them in a `@media (prefers-color-scheme: dark)` block *and* under `:root[data-theme="dark"]`, so both the OS preference and the explicit toggle work. `src/components/theme-provider.tsx` stamps `data-theme` on `<html>`; the header toggle cycles `system` / `light` / `dark`.

The token groups:

| Prefix | Tokens |
| :--- | :--- |
| Surfaces | `--bg`, `--bg-subtle`, `--surface`, `--surface-hover`, `--surface-active` |
| Lines | `--border`, `--border-strong`, `--grid-line`, `--grid-line-strong` |
| Text | `--fg`, `--fg-muted`, `--fg-subtle`, `--fg-on-accent` |
| Accent | `--accent`, `--accent-hover`, `--accent-soft`, `--accent-fg`, `--ring` |
| Status | `--success`, `--warning`, `--danger`, each with a `-soft` companion |
| Elevation | `--shadow-sm`, `--shadow-md`, `--shadow-lg`, `--shadow-accent` |
| Type | `--font-display` (Saira Semi Condensed), `--font-sans` (IBM Plex Sans), `--font-mono` (JetBrains Mono) |

Tailwind v4 utilities are generated from those variables via an `@theme inline` block, which is why components must consume the token utilities (`bg-surface`, `text-fg-muted`, `border-border`) and never a raw colour or a `white/40`-style alpha - a raw value has no dark-mode counterpart and breaks one theme or the other.

Two motion utilities exist: `.rise`, an entry animation driven by a `--rise-delay` custom property on a 70 ms beat, used for one orchestrated page-load on the guild overview and system panel; and `.skeleton`, the loading pulse. A `@media (prefers-reduced-motion: reduce)` block collapses both. All three fonts are self-hosted through `next/font`.

## Configuration

| Variable | Required | Default | Purpose |
| :--- | :---: | :--- | :--- |
| `RABBITMQ_URL` | yes | - | Broker carrying the RPC bridge. |
| `DISCORD_OAUTH2_CLIENT_ID` | yes | - | Discord application client ID. |
| `DISCORD_OAUTH2_CLIENT_SECRET` | yes | - | Discord application client secret. |
| `DASHBOARD_SESSION_SECRET` | yes | - | NextAuth JWT signing/encryption secret. `openssl rand -hex 32`. |
| `DASHBOARD_HOST` | no | `0.0.0.0` | Bind interface (`next start -H`). |
| `DASHBOARD_PORT` | no | `8080` | Listen port. |
| `AUTH_URL` | no | *(derived)* | Externally visible origin, if a proxy rewrites the host. |
| `METRICS_ENABLED` | no | `true` | Set `false` to disable the `/healthz`, `/readyz`, `/metrics` server. |
| `METRICS_PORT` | no | `9090` | Port for that server. |

The first four are validated at import time by `src/lib/env.ts`, which throws on a missing value rather than failing later with a confusing runtime error.

## Running it

```bash
# from the repo root
turbo run dev --filter=@lumi/dashboard

# or
bun run --cwd apps/dashboard dev
```

```bash
turbo run build --filter=@lumi/dashboard
turbo run typecheck --filter=@lumi/dashboard
bun run --cwd apps/dashboard test     # Vitest + Testing Library, apps/dashboard/tests/
bun run --cwd apps/dashboard lint     # eslint src
```

`worker` and RabbitMQ must be running, or every page that reads data will fail its RPC call.

> [!WARNING]
> The `dashboard` Docker Compose profile does not work yet. The shared `Dockerfile` `runner` target has no `next build` stage and copies source only, while the Compose service runs `next start`, which needs a prebuilt `.next`. Starting it exits immediately with *"Could not find a production build in the '.next' directory"*. Run the dashboard directly (above) until that image stage exists.

## Testing

Tests live in `apps/dashboard/tests/` and run under this app's own `vitest.config.ts`, separate from the root one because component tests need a DOM and the `#/*` alias is a tsconfig-only path that would collide with the monorepo's `#lib/*`-style subpath imports if registered globally. The default environment is `node`; component tests opt into jsdom with a `// @vitest-environment jsdom` docblock. `tests/setup.ts` wires Testing Library cleanup and stubs `server-only`, which throws outside Next's `react-server` export condition. The root `bun run test` includes this suite.

The security-relevant tests are in `tests/lib/auth-guards.test.ts`: a session without Manage Server must 404 on another guild's routes, and a regular authenticated session must 404 on `/system`.
