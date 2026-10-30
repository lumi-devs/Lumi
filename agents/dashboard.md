# Dashboard

`apps/dashboard` is the Lumi v2 web dashboard: a separate SvelteKit
(`adapter-node`) service written in TypeScript. It is a Bun workspace member but
has its own dependency graph and typecheck.

## Setup

```sh
nix develop --command bun install
nix develop --command bun run db:generate
cp apps/dashboard/.env.example apps/dashboard/.env
nix develop --command bun run dashboard:dev     # http://localhost:4173
nix develop --command bun run dashboard:build   # apps/dashboard/build
```

Run the production build with Node or Bun:

```sh
cd apps/dashboard
node build
# or
bun build/index.js
```

The dashboard talks directly to the same Postgres schema and Redis instance as
the bot. It constructs `@prisma/client` with `@prisma/adapter-pg` (`pg.Pool`)
and uses `ioredis`. It never imports bot internals such as `@lumi/db`,
`src/admin`, or module code.

## Environment

| Variable                     | Purpose                                                                 |
| ---------------------------- | ----------------------------------------------------------------------- |
| `DISCORD_CLIENT_ID`          | Discord OAuth2 application client id.                                   |
| `DISCORD_CLIENT_SECRET`      | Discord OAuth2 client secret. Never sent to the browser.                |
| `DISCORD_OAUTH_REDIRECT_URI` | Exact OAuth callback URL. Defaults to `${WEB_BASE_URL}/auth/callback`.  |
| `WEB_BASE_URL`               | Public origin used for verification links and the default callback URL. |
| `SESSION_SECRET`             | Random secret (16+ chars) for signed session cookies and Redis keys.    |
| `SESSION_TTL_SECONDS`        | Session lifetime. Default `604800` (7 days).                            |
| `DATABASE_URL`               | Postgres URL. Falls back to `DIRECT_POSTGRES_URL`, `POSTGRES_URL`.      |
| `REDIS_URL`                  | Redis URL; takes precedence over the discrete variables.                |
| `REDIS_HOST`/`REDIS_PORT`    | Redis endpoint when `REDIS_URL` is unset. Defaults `localhost:6379`.    |
| `REDIS_PASSWORD`/`REDIS_DB`  | Optional Redis auth/database when `REDIS_URL` is unset.                 |
| `BOT_TOKEN`                  | Bot token for guild/user/role summaries and verification role changes.  |
| `LUMI_MODULES_DIR`           | Optional bundled-module directory override for the config UI.           |
| `LUMI_DATA_DIR`              | Optional data directory override for addon repo candidate discovery.    |
| `DASHBOARD_INSECURE_COOKIES` | Set `1` only for local HTTP production testing.                         |

`BOT_TOKEN` is required. The bot must be in the server with Manage Roles and a
role hierarchy that lets it assign the configured verified/pending roles.

## OAuth2

- `GET /auth/login` creates a random `state` and PKCE verifier/challenge
  (`S256`), stores the verifier in Redis for 10 minutes, sets a scoped
  `lumi_oauth_state` cookie, then redirects to Discord with `identify guilds`.
- `GET /auth/callback` compares `state` to the cookie, consumes the Redis entry,
  exchanges the code with the client secret and PKCE verifier, and creates a
  Redis-backed session.
- The browser receives only an opaque, HMAC-signed session id in an `HttpOnly`,
  `SameSite=Lax` cookie. Access/refresh tokens, CSRF token, and profile data stay
  in Redis under `lumi:dashboard:session:*`.
- Sessions slide on access, expire after `SESSION_TTL_SECONDS`, and are removed
  on `POST /auth/logout`.
- Guild access means `owner === true` or the OAuth guild permissions include
  `ManageGuild` (or `Administrator`). Every guild load and form action calls
  `requireGuildAccess`, so a client cannot select a guild id it cannot manage.

## Routes

| Route                           | Purpose                                                        |
| ------------------------------- | -------------------------------------------------------------- |
| `/`                             | Sign-in landing page.                                          |
| `/auth/login`, `/auth/callback` | OAuth start/callback.                                          |
| `/auth/logout`                  | CSRF-protected session logout.                                 |
| `/guilds`                       | Guild picker limited to Manage Server.                         |
| `/guilds/[guildId]`             | Overview, bot presence, recent audit, backup summary.          |
| `.../modules`                   | Module list and enable/disable.                                |
| `.../modules/[module]`          | Manifest-driven config editing and reset.                      |
| `.../permits`                   | Permit list and create.                                        |
| `.../permits/[permitId]`        | Permit edit/delete, assignment create/remove.                  |
| `.../settings`                  | Prefix, locale, log channels, enforce-permits.                 |
| `.../cases`                     | Read-only audit/case viewer with filters.                      |
| `.../security`                  | Security config, panic start/end, backups, verification links. |
| `.../features`                  | Custom commands, role menus, ticket categories/panels/tickets. |
| `.../stats`                     | Read-only stats snapshots/events/aggregates.                   |
| `.../addons`                    | Addon repo/module registry (database records only).            |
| `/verify/[token]`               | Public web verification page with math captcha.                |

## Security

- Every mutation checks a per-session CSRF token (`_csrf`) and SvelteKit's origin
  check. The public verification form is captcha- and rate-limited.
- Every route/action re-authorizes the guild from the Redis session and Discord
  guild list; the guild id in the URL is never trusted on its own.
- All user input is validated with zod. Module config fields are validated by
  their manifest type (`number`, `channel`, `role`, `multi-*`, `json`, `select`).
- Output is escaped by Svelte; no `{@html}` is used. Secrets are never returned
  from loads or rendered.
- Notices, tables, forms, and navigation are responsive and keyboard accessible.
  No gradients, no client-side framework code beyond Svelte hydration.
- Addon pages only create/update `DownloaderRepo`/`DownloaderModule` rows. They
  never execute git, bun, or arbitrary shell commands. The bot's add-on manager
  materializes files and loads modules.

## Verification contract

The dashboard consumes tokens created by the bot or by its own security page.
Contract:

1. Generate a URL-safe random token (32 random bytes, base64url recommended).
2. Store only `sha256(token)` as lowercase hex in
   `VerificationToken.tokenHash`, plus `guildId`, `userId`, `expiresAt`.
3. Send the member a link: `${WEB_BASE_URL}/verify/${token}`.

`GET /verify/[token]` hashes the URL token and looks up `tokenHash`. It rejects
unknown, used (`usedAt`), and expired tokens. It reads `verifiedRoleId` and
`pendingRoleId` from `Guild.settings` key `security-verification`, shows the
guild/user summary, and issues a single-use math captcha stored in Redis for ten
minutes.

`POST` revalidates the token, consumes the captcha, checks a per-IP rate limit,
grants `verifiedRoleId` with the bot token, removes `pendingRoleId` when set, and
then sets `usedAt`. Failures are explicit: invalid link, already used, expired,
missing verified role, wrong captcha, or a Discord role-assignment failure with
a permissions/hierarchy hint. The old module Redis pending marker is cleared so
the timeout sweep does not act on a freshly verified member. The token hash is
never shown or returned.

## Limitations

- Addon install/update changes registry rows only; the bot process owns checkout,
  dependency installation, mounting, and reloads.
- The bundled module config UI discovers manifests from the repository (or
  `LUMI_MODULES_DIR`); a production deploy should ship `modules/` alongside the
  dashboard or set the override.
- Dashboard audit entries are written as `dashboard.*` actions in `AuditLog`.
