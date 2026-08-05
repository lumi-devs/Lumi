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

This is a from-scratch rewrite of the original hand-rolled `Bun.serve` SSR app. The architecture piece that **did not** change: the dashboard still never touches Postgres directly and never holds the Discord bot token — every read/write is proxied over a RabbitMQ RPC bridge to the bot worker (`apps/worker`), so a dashboard outage or traffic spike can never affect Discord gateway latency.

---

## 🌟 Overview

- **Auth**: Discord OAuth2 via [NextAuth.js (Auth.js v5)](https://authjs.dev), not hand-rolled HMAC cookie signing. Session is a JWT (`AUTH_SECRET`, mapped from `DASHBOARD_SESSION_SECRET`); `session.isBotOwner` is derived from the `BOT_OWNERS` env var.
- **RPC bridge**: `src/lib/rpc.ts` is a `server-only` module (never bundled to the client) — a straight port of the old `apps/dashboard/src/rpc.ts` RabbitMQ RPC client, now reached from Server Components / Route Handlers / Server Actions.
- **IDOR guard**: `src/lib/auth-guards.ts`'s `authorizedGuild()` is re-checked on every guild-scoped page render *and* every guild-scoped Server Action — never trusted from client state.
- **Security headers + CSP**: `next.config.ts`'s `headers()`.
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
| `BOT_OWNERS` | No | `""` | Comma-separated Discord user IDs granted the `/system` panel. |
| `DISCORD_OAUTH2_CLIENT_ID` | **Yes** | - | Discord Application Client ID. |
| `DISCORD_OAUTH2_CLIENT_SECRET` | **Yes** | - | Discord Application Client Secret. |
| `RABBITMQ_URL` | **Yes** | - | RabbitMQ broker connection string. |
| `METRICS_ENABLED` | No | `true` | Enables the `/healthz`, `/readyz`, `/metrics` telemetry server. |
| `METRICS_PORT` | No | `9090` | Port for the telemetry server (see `src/instrumentation.ts`). |

The OAuth2 redirect URI is no longer a separate env var — NextAuth derives it from the request (`/api/auth/callback/discord`); set `AUTH_URL` (or ensure `trustHost: true`, already set in `src/lib/auth.ts`) if running behind a reverse proxy.

---

## 🚀 Development

```bash
bun install

# Requires RABBITMQ_URL, DISCORD_OAUTH2_CLIENT_ID/SECRET, DASHBOARD_SESSION_SECRET set.
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

```bash
docker compose --profile dashboard up -d
```

> [!NOTE]
> The shared `runner` Dockerfile target doesn't yet have a `next build` stage — see the comment above the `dashboard` service in `docker-compose.yml`. Building/running the container image needs that follow-up before this profile works end to end.

---

## 📁 Structure

```
src/
  app/                  App Router pages (landing, /login, /guild/[guildId]/*, /system/*)
  components/           UI primitives (components/ui), layout chrome, guild/system feature components
  lib/                  auth.ts (NextAuth config), rpc.ts (server-only RPC client), auth-guards.ts (IDOR/owner guards),
                         env.ts, dashboard-fetch.ts (React.cache-deduped RPC fetchers), dashboard-data.ts (response types)
  actions/               Server Actions — guild-actions.ts, system-actions.ts, auth-actions.ts
  types/next-auth.d.ts   Session/JWT module augmentation
  instrumentation.ts     OTel + Prometheus metrics + readiness-probe boot hook (Next's server-boot convention)
```

### What's stubbed

Several UI components are intentionally left as placeholder pages with a `StubPage` component naming the exact Prisma model(s) and spec component name — e.g. moderation case manager, warn thresholds, panic mode, temp VC generators/monitor, permits, config overrides, settings history, audit log, blocklist. Each stub page's file is a 5-line wrapper; the working pattern to copy is either `app/guild/[guildId]/modules/[moduleName]/page.tsx` (dynamic form + floating save bar) or `app/guild/[guildId]/modules/page.tsx` (toggle grid).
