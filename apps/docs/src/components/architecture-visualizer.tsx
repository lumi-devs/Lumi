"use client";
import React, { useState } from "react";
import Link from "next/link";
import {
  Server,
  Cpu,
  Zap,
  Crown,
  LayoutDashboard,
  Database,
  ArrowRight,
  Code2,
  Layers,
  ChevronRight,
} from "lucide-react";

interface NodeData {
  id: string;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  accent: string;
  packagePath: string;
  docHref: string;
  specs: { label: string; value: string }[];
  description: string;
  codeSnippet: string;
}

const NODES: NodeData[] = [
  {
    id: "gateway",
    title: "Discord Gateway",
    subtitle: "WebSocket Ingress",
    icon: <Server className="h-5 w-5 text-[#748FFC]" />,
    accent: "border-[#4C6EF5]/40 bg-[#4C6EF5]/10 text-[#748FFC]",
    packagePath: "apps/worker/src/shard-client.ts",
    docHref: "/sharding",
    specs: [
      { label: "Protocol", value: "WebSocket Gateway v10" },
      { label: "Client Engine", value: "Sapphire Framework / discord.js v14" },
      { label: "Dispatch Model", value: "In-Process Event Listeners" },
    ],
    description:
      "Every worker child process maintains persistent WebSocket gateway connections for its assigned shard IDs, processing Discord interactions, commands, and events in parallel.",
    codeSnippet: `// apps/worker/src/shard-client.ts
const client = new LumiClient({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
  shards: getShardIdsFromEnv(),
});
await client.login(process.env.BOT_TOKEN);`,
  },
  {
    id: "worker",
    title: "Sharding Manager",
    subtitle: "Child Process Isolation",
    icon: <Cpu className="h-5 w-5 text-[#20C997]" />,
    accent: "border-[#12B886]/40 bg-[#12B886]/10 text-[#20C997]",
    packagePath: "apps/worker/src/main.ts",
    docHref: "/sharding",
    specs: [
      { label: "Process Model", value: "1 OS Child Process per Shard" },
      { label: "Failover", value: "Automatic Child Process Respawn" },
      { label: "Telemetry", value: "Prometheus on Port 9090" },
    ],
    description:
      "The root worker process runs discord.js's ShardingManager to spawn and supervise identical OS processes per shard with zero memory leak cross-contamination.",
    codeSnippet: `// apps/worker/src/main.ts
const manager = new ShardingManager('./dist/shard-client.js', {
  totalShards: 'auto',
  token: process.env.BOT_TOKEN,
});
manager.spawn();`,
  },
  {
    id: "event-bus",
    title: "Redis Event Bus",
    subtitle: "Streams & Task Fanout",
    icon: <Zap className="h-5 w-5 text-[#F59F00]" />,
    accent: "border-[#F59F00]/40 bg-[#F59F00]/10 text-[#F59F00]",
    packagePath: "packages/event-bus",
    docHref: "/event-bus",
    specs: [
      { label: "Transport", value: "Redis Streams (XADD / XREADGROUP)" },
      { label: "Task Engine", value: "BullMQ on Redis DB 1" },
      { label: "Cache Sync", value: "lumi:cache:invalidate" },
    ],
    description:
      "High-throughput Redis Streams message bus coordinating cross-shard task firing, distributed scheduled-task effects, and cache invalidation broadcasts.",
    codeSnippet: `// packages/event-bus/src/bus.ts
await redis.xadd('lumi:events:task_fired', '*', 
  'taskId', task.id, 
  'guildId', guildId, 
  'payload', JSON.stringify(data)
);`,
  },
  {
    id: "primary",
    title: "Primary Shard #0",
    subtitle: "Zero-Coordination Leader",
    icon: <Crown className="h-5 w-5 text-[#FB923C]" />,
    accent: "border-[#FB923C]/40 bg-[#FB923C]/10 text-[#FB923C]",
    packagePath: "packages/core/src/lib/env.ts",
    docHref: "/architecture",
    specs: [
      { label: "Election", value: "Shard ID 0 Auto-Leader" },
      { label: "Role", value: "BullMQ Scheduler + HTTP RPC Bridge" },
      { label: "Coordination", value: "Zero Leader Locks Required" },
    ],
    description:
      "Exactly one shard process (the one holding Shard ID 0) automatically assumes scheduler duties and boots the internal HTTP RPC bridge for the web dashboard.",
    codeSnippet: `// packages/core/src/lib/env.ts
export function isPrimaryShard(): boolean {
  return getShardId() === 0;
}
if (isPrimaryShard()) {
  startBullMQScheduler();
  startHttpRpcServer(8091);
}`,
  },
  {
    id: "dashboard",
    title: "Admin Dashboard",
    subtitle: "Next.js 16 Web Panel",
    icon: <LayoutDashboard className="h-5 w-5 text-[#38BDF8]" />,
    accent: "border-[#38BDF8]/40 bg-[#38BDF8]/10 text-[#38BDF8]",
    packagePath: "apps/dashboard",
    docHref: "/dashboard",
    specs: [
      { label: "Framework", value: "Next.js 16 (App Router / React 19)" },
      { label: "RPC Bridge", value: "Internal Port 8091 (66 Actions)" },
      { label: "Auth Model", value: "NextAuth v5 (Discord OAuth2)" },
    ],
    description:
      "Modern server-driven web panel that never holds the bot token and never connects directly to PostgreSQL or Redis. All operations proxy over the 66-action RPC bridge.",
    codeSnippet: `// apps/dashboard/src/lib/rpc.ts
export async function sendRpcRequest<A extends RpcAction>(action: A, data: Payload<A>) {
  return fetch('http://worker:8091/rpc', {
    method: 'POST',
    headers: { 'Authorization': \`Bearer \${RPC_INTERNAL_TOKEN}\` },
    body: JSON.stringify({ action, data })
  });
}`,
  },
  {
    id: "database",
    title: "Database Tier",
    subtitle: "PgBouncer & Prisma",
    icon: <Database className="h-5 w-5 text-[#F472B6]" />,
    accent: "border-[#F472B6]/40 bg-[#F472B6]/10 text-[#F472B6]",
    packagePath: "packages/core/src/lib/database",
    docHref: "/database",
    specs: [
      { label: "ORM", value: "Prisma Client (17 Repositories)" },
      { label: "Pooler", value: "PgBouncer on Port 6432 (Transaction Mode)" },
      { label: "Direct Port", value: "Port 5432 (Prisma Migrations Only)" },
    ],
    description:
      "High-concurrency PostgreSQL layer managed through container.db repository facades with dedicated PgBouncer connection pooling and in-memory offline mock drivers.",
    codeSnippet: `// packages/core/src/lib/database/DatabaseService.ts
// Runtime queries connect through PgBouncer (6432)
// Direct migration port (5432) used exclusively for prisma migrate
const guild = await container.db.guilds.findById(guildId);`,
  },
];

export function ArchitectureVisualizer() {
  const [selectedId, setSelectedId] = useState<string>("gateway");
  const selectedNode: NodeData = NODES.find((n) => n.id === selectedId) ?? (NODES[0] as NodeData);

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 lg:p-8 shadow-2xl">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-[var(--border)]">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-[var(--surface-active)] border border-[var(--border)] text-xs font-mono text-[var(--accent)] font-semibold mb-2">
            <Layers className="h-3.5 w-3.5" />
            <span>INTERACTIVE SYSTEM TOPOLOGY</span>
          </div>
          <h3 className="text-xl font-bold text-[var(--fg)] tracking-tight">
            How Lumi Processes Events at Scale
          </h3>
          <p className="text-xs text-[var(--fg-muted)] mt-1">
            Click any component node in the architecture diagram to inspect its codebase path, protocols, and execution lifecycle.
          </p>
        </div>

        <Link
          href={selectedNode.docHref}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[var(--surface-hover)] border border-[var(--border-strong)] hover:border-[var(--accent)] text-xs font-semibold text-[var(--fg)] transition-colors"
        >
          <span>Read {selectedNode.title} Docs</span>
          <ArrowRight className="h-3.5 w-3.5 text-[var(--accent)]" />
        </Link>
      </div>

      {/* Interactive Node Flow Diagram */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 my-6">
        {NODES.map((node) => {
          const isSelected = node.id === selectedId;
          return (
            <button
              key={node.id}
              onClick={() => setSelectedId(node.id)}
              className={`flex flex-col items-start p-4 rounded-xl border text-left transition-all duration-200 cursor-pointer ${
                isSelected
                  ? `${node.accent} shadow-lg ring-1 ring-[var(--accent)] scale-[1.02]`
                  : "border-[var(--border)] bg-[var(--bg-subtle)] hover:bg-[var(--surface-hover)] hover:border-[var(--border-strong)] text-[var(--fg-muted)]"
              }`}
            >
              <div className="mb-3 p-2 rounded-lg bg-[var(--surface)] border border-[var(--border)]">
                {node.icon}
              </div>
              <div className="text-xs font-bold text-[var(--fg)]">{node.title}</div>
              <div className="text-[11px] text-[var(--fg-subtle)] mt-0.5">{node.subtitle}</div>
            </button>
          );
        })}
      </div>

      {/* Selected Node Deep-Dive Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 rounded-xl border border-[var(--border-strong)] bg-[var(--bg)] p-5">
        <div className="lg:col-span-6 flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="font-mono text-xs text-[var(--accent)] font-semibold bg-[var(--accent-soft)] px-2 py-0.5 rounded border border-[var(--accent-border)]">
                {selectedNode.packagePath}
              </span>
            </div>
            <h4 className="text-lg font-bold text-[var(--fg)] tracking-tight">{selectedNode.title}</h4>
            <p className="text-xs text-[var(--fg-body)] mt-2 leading-relaxed">
              {selectedNode.description}
            </p>
          </div>

          <div className="space-y-2 pt-3 border-t border-[var(--border)]">
            <div className="text-[11px] font-mono uppercase tracking-wider text-[var(--fg-subtle)] font-bold">
              Key Specifications
            </div>
            <div className="grid grid-cols-1 gap-1.5 text-xs">
              {selectedNode.specs.map((s, i) => (
                <div key={i} className="flex items-center justify-between py-1 px-2.5 rounded bg-[var(--surface)] border border-[var(--border-soft)]">
                  <span className="text-[var(--fg-muted)]">{s.label}:</span>
                  <span className="font-mono font-medium text-[var(--fg)]">{s.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="lg:col-span-6 flex flex-col justify-between">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-[var(--border)] text-xs text-[var(--fg-muted)] font-mono">
            <div className="flex items-center gap-1.5">
              <Code2 className="h-3.5 w-3.5 text-[var(--accent)]" />
              <span>Implementation Blueprint</span>
            </div>
            <span>TypeScript</span>
          </div>
          <pre className="p-3.5 rounded-lg bg-[var(--surface)] border border-[var(--border)] overflow-x-auto text-[12px] font-mono text-[var(--accent-fg)] leading-relaxed">
            <code>{selectedNode.codeSnippet}</code>
          </pre>
          <div className="mt-3 flex items-center justify-end">
            <Link
              href={selectedNode.docHref}
              className="text-xs font-semibold text-[var(--accent)] hover:text-[var(--accent-fg)] inline-flex items-center gap-1 transition-colors"
            >
              <span>Explore full architectural walkthrough</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
