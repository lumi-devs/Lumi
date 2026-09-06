import type { Metadata } from "next";
import { DocPage } from "@/components/doc-page";
import { CodeBlock } from "@/components/code-block";

export const metadata: Metadata = {
  title: "Getting Started",
  description: "Boot the full Lumi stack with Nix and Docker Compose.",
};

const envExample = `# Discord application credentials
BOT_TOKEN=...

# Shared secret for dashboard -> worker RPC (generate with: openssl rand -hex 32)
RPC_INTERNAL_TOKEN=...

# Dashboard session encryption + Discord OAuth2
DASHBOARD_SESSION_SECRET=...
DISCORD_OAUTH2_CLIENT_ID=...
DISCORD_OAUTH2_CLIENT_SECRET=...

# Local database password (defaults to "lumi" when unset)
POSTGRES_PASSWORD=...`;

const boot = `nix develop
bun install
cp .env.example .env   # then fill in the values above
docker compose up -d`;

const devRun = `# Bot worker with live reload (needs Postgres + Redis reachable)
bun run --filter @lumi/worker dev

# Dashboard on http://localhost:8080
bun run --cwd apps/dashboard dev`;

export default function GettingStartedPage() {
  return (
    <DocPage
      title="Getting Started"
      lede="Boot the full stack — worker, Postgres, PgBouncer, and Redis — with Nix and Compose, then run the dashboard for administration."
      path="/getting-started"
    >
      <h2>Prerequisites</h2>
      <ul>
        <li>
          <strong>Nix</strong> with flakes enabled. Everything else (Bun 1.4, tooling) comes from
          the repo devshell — enter it with <code>nix develop</code> before running any
          <code>bun</code> command.
        </li>
        <li>
          <strong>Docker</strong> with the Compose v2 plugin, for Postgres, PgBouncer, Redis, and
          the worker containers.
        </li>
        <li>
          A <strong>Discord application</strong> with a bot token (<code>BOT_TOKEN</code>), invited
          to your test server.
        </li>
      </ul>

      <h2>Configure the environment</h2>
      <p>
        Copy the example env file and fill in at least the bot token and the RPC secret. The RPC
        secret authenticates dashboard-to-worker calls — leaving it unset is a hard failure, not
        an insecure default.
      </p>
      <CodeBlock code={envExample} language="bash" title=".env" />
      <p>
        Every variable is documented with its real default in <a href="/configuration">Configuration</a>.
      </p>

      <h2>Boot the stack</h2>
      <CodeBlock code={boot} language="bash" title="Boot" />
      <p>This starts the default profile:</p>
      <ul>
        <li>
          <code>worker</code> — the bot, with its internal RPC port exposed to other containers
          only (never published to the host).
        </li>
        <li>
          <code>postgres</code> (Postgres 18) behind <code>pgbouncer</code> in transaction-pooling
          mode, plus <code>redis</code> (Redis 8) with persistence on.
        </li>
      </ul>
      <p>Loopback-bound ports on your machine: Postgres <code>5432</code>, PgBouncer <code>6432</code>, Redis <code>6379</code>.</p>

      <h2>Optional profiles</h2>
      <ul>
        <li>
          <code>--profile dashboard</code> — the Next.js admin panel on port <code>8080</code>.
          Needs the <code>DASHBOARD_*</code> and <code>DISCORD_OAUTH2_*</code> values above.
        </li>
        <li>
          <code>--profile development</code> — a <code>lumi-dev</code> container with the repo
          bind-mounted for live container hacking.
        </li>
        <li>
          <code>--profile scale</code> — a second worker replica plus the nirn outbound REST
          proxy, the shape a multi-worker deployment takes.
        </li>
        <li>
          <code>--profile observability</code> — OpenTelemetry collector, Tempo, Prometheus, and
          Grafana (Grafana listens on <code>127.0.0.1:3001</code>, which collides with the docs
          dev server below — run one at a time).
        </li>
      </ul>

      <h2>Run from source</h2>
      <p>For day-to-day development, run the processes directly instead of in containers:</p>
      <CodeBlock code={devRun} language="bash" title="Dev runs" />

      <h2>Next steps</h2>
      <ul>
        <li>
          <a href="/configuration">Configuration</a> — every environment variable that actually
          exists, and where it is read.
        </li>
        <li>
          <a href="/architecture">Architecture</a> — what you just booted, and how the pieces
          talk to each other.
        </li>
        <li>
          <a href="/dashboard">Dashboard</a> — sign in with Discord and administer your server
          from the web.
        </li>
      </ul>
    </DocPage>
  );
}
