# 🖥️ @lumi/dashboard

<div align="center">
  <img src="https://img.shields.io/badge/Next.js-16-black?style=for-the-badge&logo=next.js" alt="Next.js">
  <img src="https://img.shields.io/badge/Bun-1.3+-black?style=for-the-badge&logo=bun" alt="Bun">
  <img src="https://img.shields.io/badge/TypeScript-5.9-blue?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/Port-8080-orange?style=for-the-badge" alt="Port">
  <img src="https://img.shields.io/badge/Auth-NextAuth.js-5865F2?style=for-the-badge&logo=discord&logoColor=white" alt="Discord OAuth2 via NextAuth.js">
</div>

<br />

The **Lumi Dashboard** (`@lumi/dashboard`) is a Next.js (App Router) web administration panel. It empowers Discord server administrators to manage Lumi bot features, toggle modules, and modify configuration settings directly from a browser UI without using Discord chat commands.

This is a from-scratch rewrite of the original hand-rolled `Bun.serve` SSR app. The architecture piece that **did not** change: the dashboard still never touches Postgres directly and never holds the Discord bot token — every read/write is proxied over an internal HTTP RPC bridge to the bot worker (`apps/worker`), so a dashboard outage or traffic spike can never affect Discord gateway latency.

---

## 🌟 Overview

- **Auth**: Discord OAuth2 via [NextAuth.js (Auth.js v5)](https://authjs.dev), not hand-rolled HMAC cookie signing. Session is a JWT (`AUTH_SECRET`, mapped from `DASHBOARD_SESSION_SECRET`); `session.isBotOwner` comes from the worker's `auth.whoami` RPC, so it tracks `PermitResolver.isBotOwner` (`OWNER_IDS` env var, or the Discord application's actual owner) with no separate dashboard-side owner list. That fact and the user's manageable-guild list are re-derived at most once per 5 minutes (`AUTHZ_TTL_MS` in `src/lib/auth.ts`), bounded by a process-local snapshot rather than the JWT timestamp alone.
- **RPC bridge**: `src/lib/rpc.ts` is a `server-only` module (never bundled to the client) — an HTTP client that `POST`s to the worker's internal RPC server directly over the docker/cluster network, reached from Server Components / Route Handlers / Server Actions.
- **IDOR guard**: `src/lib/auth-guards.ts`'s `authorizedGuild()` is re-checked on every guild-scoped page render *and* every guild-scoped Server Action — never trusted from client state.
- **Security headers**: `next.config.ts`'s `headers()` — `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Strict-Transport-Security`, `Permissions-Policy`.
- **CSP**: `src/middleware.ts`, deliberately *not* `next.config.ts`. Next only nonces its inline RSC flight scripts when it can read a `content-security-policy` header off the **incoming request**, and only middleware can set one — a response header from `next.config.ts` is invisible to the renderer, so a strict `script-src 'self'` set there blocks every flight script and hydration never runs.
- **CSRF**: Next.js Server Actions' built-in same-origin (Origin vs Host) check — no hand-rolled token system.
- **Design direction**: *engineering blueprint / operator console.* Hairline rules, wide uppercase micro-labels, condensed engineered type for chrome, a 32px graph-paper field behind the page, and one saturated signal colour (blueprint cobalt) reserved for the primary action and the active route. Amber/green/red are reserved for machine status only, so decoration can never be mistaken for a state readout. Surfaces that carry data stay opaque and flat.
- **Design system**: Tailwind v4 tokens generated from the semantic CSS custom properties in `src/app/globals.css` (`--surface`, `--fg-muted`, `--accent`, …). Components must consume those tokens — never a raw colour or a `white/40`-style alpha, or light mode breaks. Light and dark are both authored; `system`/`light`/`dark` is chosen via `data-theme` on `<html>` (`src/components/theme-provider.tsx`, toggled from the header).
- **Type**: Saira Semi Condensed for chrome (titles, nav, buttons, badges, table headers, micro-labels — `font-display`), IBM Plex Sans for body and dense prose (`font-sans`), JetBrains Mono for data (snowflakes, module names, URLs — `font-mono`). All three self-hosted via `next/font`.
- **Motion**: one orchestrated page-load on the guild overview and system panel — `.rise` with a `--rise-delay` custom property on a 70ms beat. Nothing else animates on entry; `prefers-reduced-motion` collapses it.
- **Icons**: `lucide-react`, used for all application chrome. Emoji are never used as an icon set; a module's own `emoji` field is author-supplied identity metadata and is rendered inside `components/ui/glyph.tsx`.

---

## ⚙️ Configuration & Environment Variables

| Environment Variable | Required | Default | Description |
|---|:---:|:---:|---|
| `DASHBOARD_HOST` | No | `0.0.0.0` | Interface to bind (used by `next start -H`). |
| `DASHBOARD_PORT` | No | `8080` | Port to listen on. |
| `DASHBOARD_SESSION_SECRET` | **Yes** | - | NextAuth's session JWT encryption secret. Generate with `openssl rand -hex 32`. |
| `DISCORD_OAUTH2_CLIENT_ID` | **Yes** | - | Discord Application Client ID. |
| `DISCORD_OAUTH2_CLIENT_SECRET` | **Yes** | - | Discord Application Client Secret. |
| `RPC_HTTP_URL` | **Yes** | - | Base URL of the worker's internal RPC HTTP server, e.g. `http://worker:8091`. |
| `METRICS_ENABLED` | No | `true` | Enables the `/healthz`, `/readyz`, `/metrics` telemetry server. |
| `METRICS_PORT` | No | `9090` | Port for the telemetry server (see `src/instrumentation.ts`). |

The OAuth2 redirect URI is not an env var — NextAuth derives it from the request. Register `<dashboard-origin>/api/auth/callback/discord` under **OAuth2 → Redirects** on your Discord application. Behind a reverse proxy that rewrites the Host header, set `AUTH_URL` to the externally visible origin (`trustHost: true` is already set in `src/lib/auth.ts`). There is likewise no secure-cookie variable: NextAuth picks the `__Secure-` cookie prefix from the resolved URL scheme.

Full reference, including the route inventory and the 50-action RPC surface: [`docs/dashboard.md`](../../docs/dashboard.md).

---

## 🚀 Development

```bash
bun install

# Requires RPC_HTTP_URL, DISCORD_OAUTH2_CLIENT_ID/SECRET, DASHBOARD_SESSION_SECRET set.
bun run --cwd apps/dashboard dev
# or, from repo root:
turbo run dev --filter=@lumi/dashboard
```

```bash
# Build + typecheck (also covered by the root `bun run typecheck` / `bun run build`)
turbo run build --filter=@lumi/dashboard
turbo run typecheck --filter=@lumi/dashboard
```

### Docker Compose

> [!WARNING]
> `docker compose --profile dashboard up` does **not** work. The shared `runner` Dockerfile target has no `next build` stage and copies source only, while the Compose service runs `next start`, which needs a prebuilt `.next` — the container exits immediately with *"Could not find a production build in the '.next' directory"*. See the comment above the `dashboard` service in `docker-compose.yml`. Run the dashboard directly (above) until that image stage lands.

---

## 📁 Structure

```
src/
  app/                  App Router pages (landing, /login, /guild/[guildId]/*, /system/*)
  components/           UI primitives (components/ui), layout chrome, guild/system feature components
  lib/                  auth.ts (NextAuth config), rpc.ts (server-only RPC client), auth-guards.ts (IDOR/owner guards),
                         env.ts, dashboard-fetch.ts (React.cache-deduped RPC fetchers), dashboard-data.ts (response types)
  actions/               Server Actions, one file per domain — guild, moderation, security,
                         tempvc, overrides, history, blocklist, advanced, system, user, auth
  types/next-auth.d.ts   Session/JWT module augmentation
  instrumentation.ts     OTel + Prometheus metrics + readiness-probe boot hook (Next's server-boot convention)
```

### Adding a route

Every route is wired to a real RPC read. The working patterns to copy are `app/guild/[guildId]/modules/[moduleName]/page.tsx` (dynamic form + floating save bar) and `app/guild/[guildId]/modules/page.tsx` (toggle grid).
