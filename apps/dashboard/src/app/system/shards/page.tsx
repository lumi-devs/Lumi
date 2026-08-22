import { Activity, Gauge, Layers, Server } from "lucide-react";
import { requireBotOwner } from "#/lib/auth-guards";
import { getSystemShards } from "#/lib/dashboard-fetch";
import { ShardFleet } from "#/components/system/shard-fleet";
import { StatsGrid } from "#/components/stats-grid";
import { PageHeader } from "#/components/ui/page-header";
import { Badge } from "#/components/ui/badge";

export default async function SystemShardsPage() {
  const session = await requireBotOwner();
  const data = await getSystemShards(session.userId);

  const reporting = data.shards.length;
  const pings = data.shards
    .map((s) => s.ping)
    .filter((p): p is number => p !== null)
    .sort((a, b) => a - b);
  const medianPing = pings.length > 0 ? pings[Math.floor(pings.length / 2)]! : null;
  const guilds = data.shards.reduce((sum, s) => sum + s.guildCount, 0);
  const degraded = data.missingShardIds.length > 0;
  // Nothing reporting is its own state: with no rows and no assignment there is
  // also nothing "missing", so a bare `degraded` check would call it healthy.
  const silent = reporting === 0;
  const fleetStatus = silent
    ? { variant: "warning" as const, tone: "warning" as const, label: "No shards reporting" }
    : degraded
      ? { variant: "danger" as const, tone: "danger" as const, label: "Shards missing" }
      : { variant: "success" as const, tone: "success" as const, label: "All shards reporting" };

  return (
    <div className="flex flex-col gap-4">
      <div className="rise" style={{ "--rise-delay": "0ms" } as React.CSSProperties}>
        <PageHeader
          title="Cluster Shards"
          description="Every gateway shard Lumi expects to be running, and the process holding it. Readings refresh when you reload."
          actions={
            <Badge variant={fleetStatus.variant} dot>
              {fleetStatus.label}
            </Badge>
          }
          meta={
            <p className="font-mono text-[13px] text-fg-subtle">
              cluster {data.clusterName} · {data.shardCount} total shards
            </p>
          }
        />
      </div>

      <div className="rise" style={{ "--rise-delay": "70ms" } as React.CSSProperties}>
        <StatsGrid
          stats={[
            {
              icon: Layers,
              label: "Shards reporting",
              value: `${reporting} / ${data.shardCount}`,
              tone: fleetStatus.tone,
            },
            { icon: Server, label: "Gateway processes", value: data.replicas.length },
            {
              icon: Gauge,
              label: "Median latency",
              value: medianPing === null ? "—" : `${medianPing} ms`,
            },
            { icon: Activity, label: "Guilds on shards", value: guilds },
          ]}
        />
      </div>

      <div className="rise" style={{ "--rise-delay": "140ms" } as React.CSSProperties}>
        <ShardFleet data={data} />
      </div>
    </div>
  );
}
