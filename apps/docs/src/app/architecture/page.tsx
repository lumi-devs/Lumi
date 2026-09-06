import type { Metadata } from "next";
import { DocPage } from "@/components/doc-page";
import { CodeBlock } from "@/components/code-block";
import { rpcActionCount } from "@/lib/rpc-actions";

export const metadata: Metadata = {
  title: "Architecture",
  description: "How the sharded worker, dashboard, Postgres, and Redis fit together.",
};

const fleet = `manager (apps/worker/src/main.ts)
  ShardingManager — spawns children, forwards signals, never touches Discord
  │
  ├─ shard child (shard-client.ts) — gateway + every command, module, handler
  ├─ shard child — same image, different shard ids
  └─ ★ primary child (holds shard 0)
       └─ also owns BullMQ scheduling + RPC/metrics HTTP on :8091

dashboard (Next.js) ──RPC+token──▶ primary child :8091 ──▶ Postgres / Redis`;

export default function ArchitecturePage() {
  return (
    <DocPage
      title="Architecture"
      lede="One bot entrypoint that fans out into identical shard processes, a dashboard that only talks HTTP, and two datastores with strict roles."
      path="/architecture"
    >
      <h2>The worker fleet</h2>
      <p>
        <code>apps/worker/src/main.ts</code> is a thin discord.js <code>ShardingManager</code>.
        The manager process itself never opens a Discord connection and does no application work
        — it spawns one identical child process per shard it owns (
        <code>shard-client.ts</code>) and forwards shutdown signals to them. Every child owns the
        gateway connections for its shards and runs every command, module, and interaction
        handler.
      </p>
      <p>
        There is no separate scheduler role and no leader election. Exactly one shard per pod —
        the one holding shard id <code>0</code> — is the primary (
        <code>isPrimaryShard()</code> in <code>packages/core/src/lib/env.ts</code>) and
        additionally owns BullMQ job scheduling plus the RPC/metrics HTTP surface. A standalone
        dev run with no <code>ShardingManager</code> is always primary.
      </p>
      <CodeBlock code={fleet} language="text" title="Process topology" />

      <h2>The dashboard RPC bridge</h2>
      <p>
        <code>apps/dashboard</code> never opens a Postgres or Redis connection and never holds
        the bot token. Every read and write is proxied over an internal HTTP RPC bridge to the
        worker: a <code>server-only</code> client posts an envelope (
        <code>id</code>, <code>action</code>, <code>guildId</code>, <code>actorId</code>, optional{" "}
        <code>traceparent</code>, <code>data</code>) to the primary shard, authenticated by{" "}
        <code>RPC_INTERNAL_TOKEN</code>. A dashboard outage or traffic spike can therefore never
        affect Discord gateway latency.
      </p>
      <p>
        The action surface is defined once in <code>packages/contracts/src/rpc.ts</code>:{" "}
        <code>RpcRequestPayloads</code> maps each of the {rpcActionCount} wire action strings to
        its payload, with <code>never</code> marking actions that take no data. See{" "}
        <a href="/rpc">RPC Reference</a> for the full table.
      </p>

      <h2>Postgres: system of record</h2>
      <p>
        Postgres 18 is the durable store, fronted by PgBouncer in transaction-pooling mode. The
        worker connects through the pooler (<code>POSTGRES_URL</code>), while migrations use the
        direct URL (<code>DIRECT_POSTGRES_URL</code>) — pooled connections cannot run DDL
        reliably. Because a fixed per-process pool multiplies by shard count, the pool size is
        derived from a fleet-wide budget (<code>POSTGRES_POOL_TOTAL</code>, default 80) divided
        across shards; <code>POSTGRES_POOL_MAX</code> overrides it for pooler-fronted setups.
        Modules reach the database through <code>container.db</code>, never the raw Prisma
        client.
      </p>

      <h2>Redis: bus, cache, and coordination</h2>
      <p>
        Redis 8 carries everything ephemeral: the Streams event bus (
        <code>packages/event-bus</code>) relaying fired scheduled-task effects from the primary
        shard to every shard, shared caches invalidated through the invalidation bus rather than
        raw deletes, and shard telemetry. Redis can run standalone, behind sentinels, or as a
        cluster (<code>REDIS_CLUSTER_NODES</code>); the dashboard never connects to it at all.
      </p>

      <h2>Fleet visibility</h2>
      <p>
        Each gateway process publishes shard telemetry to Redis (<code>packages/sharding</code>),
        namespaced per replica by <code>CLUSTER_NAME</code>. The dashboard fleet view reads it
        back through <code>system.shards.get</code>, which reports replicas, per-shard status and
        ping, and the expected shard ids no process is reporting. Shard assignment itself stays
        discord.js&apos;s job — the telemetry layer only observes.
      </p>

      <h2>Outbound traffic and observability</h2>
      <p>
        A single worker talks to Discord directly. Once multiple workers share a bot token, point{" "}
        <code>DISCORD_PROXY_URL</code> at the shared outbound REST proxy (nirn-proxy, scale
        profile) so REST calls are centrally rate-limited. Tracing, metrics, and health probes
        come from <code>packages/observability</code> — OpenTelemetry to the collector, Tempo for
        traces, Prometheus for metrics, Grafana for display — all behind the observability
        Compose profile.
      </p>
    </DocPage>
  );
}
