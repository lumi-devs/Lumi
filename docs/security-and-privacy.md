# Lumi Security Model & Privacy Policy

> Detailed technical specification of Lumi-TS process security models, third-party addon privilege boundaries, Discord user privacy policy, data retention rules, and datastore security standards.

---

## 🔒 1. Security Model Notice & Addon Trust Boundaries

Lumi includes a dynamic third-party addon downloader service capable of fetching and loading external feature modules at runtime.

### Process Privilege & Sandboxing Notice

> [!WARNING]
> **No Process Sandboxing**: Third-party addons executed by Lumi run in the **main process context**. They possess full privileges of the hosting Node/Bun runtime, including:
> - Access to the Discord Bot Token (`BOT_TOKEN`)
> - Full read/write access to the PostgreSQL database (`DATABASE_URL`)
> - Unrestricted access to Redis datastores and filesystem resources
> - Ability to execute arbitrary network calls

### Operator Guidelines

1. **Audit Source Code**: Always inspect third-party addon source code using `bun run validate <path>` prior to installation in production.
2. **Trusted Repositories**: Only install addons from cryptographically verified or official maintainer repositories (`lumi-addons`).
3. **Least-Privilege Environment**: Run Lumi under an isolated, unprivileged system user account (or isolated container environment) to limit host filesystem damage in the event of an untrusted addon execution.

---

## 🛡️ 2. Discord Data Privacy Policy

Lumi is committed to protecting Discord user privacy and complying with the Discord Developer Terms of Service and global data protection regulations (such as GDPR).

### Stored Data Types

Lumi strictly limits data collection to the minimum required for community management and moderation:

| Data Type | Purpose | Persistent Storage | Long-Term Retention |
|---|---|---|---|
| **Guild ID & Channel ID** | Guild configuration, logging destinations, module toggles | PostgreSQL (`GuildConfig`) | Retained while bot is in guild |
| **User ID** | Moderation history, warning counts, AFK status, case logs | PostgreSQL (`ModCase`, `AfkEntry`) | Retained for guild audit history |
| **Moderation Notes** | Reasons for bans, kicks, warnings, and timeouts | PostgreSQL (`ModCase`) | Retained until manually purged |
| **Filter Rules & Blacklists** | Custom server regex patterns and word blacklists | PostgreSQL (`FilterConfig`) | Retained until guild reset |
| **AFK Status Message** | Temporary note displayed when mentioned while away | Redis / PostgreSQL | Auto-deleted when AFK clears |
| **Raw Message Content** | Real-time chat filtering & audit logging | In-Memory Only | ❌ **Never stored long-term** |

---

### Data Retention & Purge Policy

- **Guild Offboarding**: When Lumi leaves a Discord guild (`GUILD_DELETE`), guild configuration caches are invalidated immediately. Guild configuration records are marked inactive.
- **AFK Data**: AFK notes and timestamps are automatically deleted from PostgreSQL and Redis the moment the user sends a message or invokes `/afk clear`.
- **Audit Logs**: Moderation audit logs are maintained for server security history unless explicitly removed by server administrators.

---

### Deletion Requests & GDPR Compliance

Discord users or guild administrators have the right to request full erasure of their stored data.

#### Handled via RPC / CLI Commands

1. **Automated User Erasure (`global.gdpr.delete`)**:
   Administrators or system operators can dispatch the GDPR deletion RPC action over RabbitMQ, which recursively purges:
   - All moderation case associations for the specified `userId`.
   - Active AFK records and temporary notes.
   - Any cached user metadata in Redis.

2. **Manual DB Purge Script**:
   Operators can run internal database sanitization scripts to anonymize or erase user records across all tables:
   ```bash
   bun scripts/gdpr-purge.ts --user <USER_ID>
   ```

---

## 🔑 3. Datastore & Infrastructure Security Standards

### Database & Redis Encryption in Transit

- **PostgreSQL**: Production environments MUST enforce SSL/TLS encryption by appending `?sslmode=require` to `DATABASE_URL`.
- **Redis**: Secure Redis endpoints using TLS wrapping (`rediss://`) when connecting across external networks.
- **RabbitMQ**: Enforce TLS listeners (`amqps://`) for cross-data-center RPC communication.

### Network Isolation & Firewall Boundaries

In distributed deployment topologies:
- `apps/dashboard` (the internet-facing web server) MUST NOT have direct network access to PostgreSQL or Redis. It communicates strictly via RabbitMQ RPC (`apps/worker`).
- `apps/gateway` MUST be isolated within a private container network, exposing zero public HTTP ports (except `METRICS_PORT=9090` to internal scrapers).

### Redis Key Namespace Conventions

To prevent key collision and data contamination across services, all Redis key operations must adhere to static key templates defined in `RedisKeys` (`src/lib/database/redis.ts`):

- Guild Configuration: `lumi:guild:<guildId>:config`
- Module States: `lumi:guild:<guildId>:modules`
- Cluster Coordination: `lumi:cluster:<name>:members`
- Stream Envelopes: `lumi:stream:gateway`
