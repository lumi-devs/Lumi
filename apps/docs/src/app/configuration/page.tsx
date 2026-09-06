import type { Metadata } from "next";
import { DocPage } from "@/components/doc-page";
import { CodeBlock } from "@/components/code-block";

export const metadata: Metadata = {
  title: "Configuration",
  description: "Every environment variable Lumi actually reads, and where it is read.",
};

const secrets = `openssl rand -hex 32   # RPC_INTERNAL_TOKEN, DASHBOARD_SESSION_SECRET
openssl rand -base64 24  # GRAFANA_PASSWORD (observability profile)`;

const emojiExample = `// config/emojis.ts
export default {
  Success: "🎉",
  Error: "<:sadge:1234567890123456789>",
  Gear: "<a:spin:1234567890123456789>",
};`;

interface EnvRow {
  name: string;
  required: string;
  fallback: string;
  about: string;
}

function EnvTable({ rows }: { rows: EnvRow[] }) {
  return (
    <div className="doc-table-wrap">
      <table className="doc-table">
        <thead>
          <tr>
            <th>Variable</th>
            <th>Required</th>
            <th>Default</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name}>
              <td>
                <code>{row.name}</code>
              </td>
              <td style={{ color: "var(--fg-muted)", whiteSpace: "nowrap" }}>{row.required}</td>
              <td style={{ color: "var(--fg-muted)" }}>
                <code>{row.fallback}</code>
              </td>
              <td>{row.about}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const workerRows: EnvRow[] = [
  { name: "BOT_TOKEN", required: "yes", fallback: "—", about: "Discord bot token. The worker refuses to start without it." },
  { name: "TOTAL_SHARDS", required: "no", fallback: "auto", about: "Shard count for the ShardingManager, or auto to let Discord decide." },
  { name: "SHARD_LIST", required: "no", fallback: "auto", about: "Comma-separated shard ids this deployment owns, or auto." },
  { name: "POSTGRES_URL", required: "yes", fallback: "—", about: "Primary Postgres connection string (point it at PgBouncer in Compose)." },
  { name: "POSTGRES_REPLICA_URL", required: "no", fallback: "—", about: "Optional read-replica connection string." },
  { name: "POSTGRES_APP_NAME", required: "no", fallback: "lumi-worker-<shards>", about: "application_name reported to Postgres per process." },
  { name: "POSTGRES_POOL_MAX", required: "no", fallback: "derived", about: "Explicit per-process pool size. Wins over the budget below." },
  { name: "POSTGRES_POOL_TOTAL", required: "no", fallback: "80", about: "Fleet-wide connection budget, divided across shards so scaling out never exhausts max_connections." },
  { name: "DIRECT_POSTGRES_URL", required: "no", fallback: "—", about: "Direct Postgres URL used by migrations, bypassing PgBouncer." },
  { name: "REDIS_HOST", required: "no", fallback: "127.0.0.1", about: "Standalone/sentinel Redis host." },
  { name: "REDIS_PORT", required: "no", fallback: "6379", about: "Standalone/sentinel Redis port." },
  { name: "REDIS_PASSWORD", required: "no", fallback: "—", about: "Redis password." },
  { name: "REDIS_CACHE_DB", required: "no", fallback: "—", about: "Logical database index for cache data." },
  { name: "REDIS_TASK_DB", required: "no", fallback: "—", about: "Logical database index for scheduled-task data." },
  { name: "REDIS_SENTINELS", required: "no", fallback: "—", about: "Sentinel addresses when running Redis in sentinel mode." },
  { name: "REDIS_SENTINEL_NAME", required: "no", fallback: "—", about: "Sentinel master name." },
  { name: "REDIS_SENTINEL_PASSWORD", required: "no", fallback: "—", about: "Sentinel password." },
  { name: "REDIS_CLUSTER_NODES", required: "no", fallback: "—", about: "Comma-separated host:port list enabling cluster mode." },
  { name: "REDIS_CLUSTER_SCALE_READS", required: "no", fallback: "master", about: "Read scaling policy: master, slave, or all." },
  { name: "REDIS_CLUSTER_SLOTS_REFRESH_TIMEOUT_MS", required: "no", fallback: "—", about: "Slot-refresh timeout for the cluster client." },
  { name: "RPC_HTTP_HOST", required: "no", fallback: "127.0.0.1", about: "Bind for the worker RPC/metrics surface. Widened to 0.0.0.0 only on the container the dashboard calls." },
  { name: "RPC_HTTP_PORT", required: "no", fallback: "8091", about: "Port for the worker RPC/metrics surface." },
  { name: "RPC_INTERNAL_TOKEN", required: "yes", fallback: "—", about: "Shared secret authenticating dashboard-to-worker RPC. Unset is a hard failure." },
  { name: "OWNER_IDS", required: "no", fallback: "—", about: "Extra bot-owner ids recognized by the permit resolver (the Discord application owner is always an owner)." },
  { name: "LUMI_CONSUMER_ID", required: "no", fallback: "hostname / pid", about: "Stable consumer identity for stream processing." },
  { name: "CLUSTER_NAME", required: "no", fallback: "default", about: "Namespaces shard telemetry per replica for the fleet view." },
  { name: "LUMI_DEV_PATHS", required: "no", fallback: "—", about: "Colon/comma-separated extra module directories for local add-on development. Never set in production." },
  { name: "DISCORD_PROXY_URL", required: "no", fallback: "—", about: "Shared outbound REST proxy root (nirn-proxy). Unset means direct Discord API calls." },
  { name: "DASHBOARD_PUBLIC_URL", required: "no", fallback: "—", about: "Public dashboard origin used to build appeal links. Unset skips appeal links." },
  { name: "NODE_ENV", required: "no", fallback: "development", about: "Runtime environment flag." },
];

const observabilityRows: EnvRow[] = [
  { name: "OTEL_ENABLED", required: "no", fallback: "true", about: "Enable OpenTelemetry tracing." },
  { name: "OTEL_EXPORTER_OTLP_ENDPOINT", required: "no", fallback: "collector:4318", about: "OTLP endpoint traces are exported to." },
  { name: "OTEL_TRACES_SAMPLE_RATIO", required: "no", fallback: "1", about: "Trace sampling ratio." },
  { name: "OTEL_DIAG", required: "no", fallback: "—", about: "OpenTelemetry diagnostics flag." },
  { name: "METRICS_ENABLED", required: "no", fallback: "true", about: "Serve /healthz, /readyz, and /metrics." },
  { name: "METRICS_HOST", required: "no", fallback: "—", about: "Bind for the telemetry server." },
  { name: "METRICS_PORT", required: "no", fallback: "9090", about: "Port for the telemetry server." },
  { name: "LOG_FORMAT", required: "no", fallback: "json", about: "Log encoding: json in Compose, pretty in the dev container." },
  { name: "LOG_LEVEL", required: "no", fallback: "info", about: "Minimum log level." },
];

const dashboardRows: EnvRow[] = [
  { name: "DASHBOARD_HOST", required: "no", fallback: "0.0.0.0", about: "Interface the dashboard binds." },
  { name: "DASHBOARD_PORT", required: "no", fallback: "8080", about: "Port the dashboard listens on." },
  { name: "DASHBOARD_SESSION_SECRET", required: "yes", fallback: "—", about: "NextAuth session JWT encryption secret." },
  { name: "DISCORD_OAUTH2_CLIENT_ID", required: "yes", fallback: "—", about: "Discord application client id." },
  { name: "DISCORD_OAUTH2_CLIENT_SECRET", required: "yes", fallback: "—", about: "Discord application client secret." },
  { name: "RPC_HTTP_URL", required: "yes", fallback: "—", about: "Base URL of the worker RPC server, e.g. http://worker:8091." },
  { name: "AUTH_URL", required: "proxy only", fallback: "—", about: "Externally visible origin when a reverse proxy rewrites Host." },
];

const composeRows: EnvRow[] = [
  { name: "POSTGRES_USER", required: "no", fallback: "lumi", about: "Postgres superuser name created at init." },
  { name: "POSTGRES_PASSWORD", required: "no", fallback: "lumi", about: "Postgres password. Change it in any shared deployment." },
  { name: "GRAFANA_USER", required: "no", fallback: "admin", about: "Grafana admin username (observability profile)." },
  { name: "GRAFANA_PASSWORD", required: "yes*", fallback: "—", about: "*Required only under the observability profile. No default on purpose." },
  { name: "NIRN_LOG_LEVEL", required: "no", fallback: "info", about: "Log level for the nirn outbound proxy (scale profile)." },
];

export default function ConfigurationPage() {
  return (
    <DocPage
      title="Configuration"
      lede="Every environment variable Lumi actually reads. If a variable is not listed here, setting it is a silent no-op."
      path="/configuration"
    >
      <h2>Worker and shared libraries</h2>
      <p>
        Read by <code>packages/core/src/lib/env.ts</code>, the Redis client, the RPC HTTP server,
        and the permit resolver. <code>SHARD_COUNT</code>, <code>SHARDS</code>,{" "}
        <code>SHARDING_MANAGER</code>, and <code>HOSTNAME</code> are injected by the runtime — do
        not set them yourself.
      </p>
      <EnvTable rows={workerRows} />

      <h2>Observability</h2>
      <p>
        Read by <code>packages/observability</code>. Wired identically across worker and
        dashboard.
      </p>
      <EnvTable rows={observabilityRows} />

      <h2>Dashboard</h2>
      <p>
        Read by <code>apps/dashboard/src/lib/env.ts</code>. The dashboard holds no bot token and
        opens no database connection — it only needs its session secret, Discord OAuth2
        credentials, and the worker RPC address.
      </p>
      <EnvTable rows={dashboardRows} />
      <p>
        The OAuth2 redirect URI is not a variable: register{" "}
        <code>&lt;dashboard-origin&gt;/api/auth/callback/discord</code> on your Discord
        application. There is no owner-list variable either — bot-owner detection goes through
        the <code>auth.whoami</code> RPC.
      </p>

      <h2>Compose-only values</h2>
      <p>Consumed by <code>docker-compose.yml</code> itself rather than application code.</p>
      <EnvTable rows={composeRows} />

      <h2>Generating secrets</h2>
      <CodeBlock code={secrets} language="bash" title="Secrets" />

      <h2>Custom emojis</h2>
      <p>
        Every emoji Lumi uses in cards, status messages, and command replies comes from one
        place: <code>packages/core/src/lib/utilities/assets.ts</code>. To swap any of them for
        your own — a custom Discord emoji, or just a different unicode glyph — create{" "}
        <code>config/emojis.ts</code> at the repo root (or edit the one already checked in with
        every key commented out) and export the keys you want to override:
      </p>
      <CodeBlock code={emojiExample} language="typescript" title="config/emojis.ts" />
      <p>
        Keys you don&apos;t set keep Lumi&apos;s default. A custom Discord emoji uses the same
        format Discord itself renders it as in a sent message —{" "}
        <code>{"<:name:id>"}</code>, or <code>{"<a:name:id>"}</code> if it&apos;s animated — copy
        it straight out of a Discord message (type a backslash before the emoji to see its raw
        form). The bot needs to actually be in a server that has that emoji for it to render.
      </p>
      <p>
        <code>config/emojis.ts</code> lists every available key as a comment, with its default
        value, so you can see everything that&apos;s overridable without leaving the file.
        Changes apply on the next restart — there&apos;s no hot-reload for this file.
      </p>
    </DocPage>
  );
}
