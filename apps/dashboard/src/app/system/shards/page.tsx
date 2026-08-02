import { requireBotOwner } from "#/lib/auth-guards";
import { StubPage } from "#/components/stub-page";

export default async function SystemShardsPage() {
  await requireBotOwner();
  return (
    <StubPage
      emoji="📡"
      title="Sharding Telemetry"
      specComponent="ClusterShardingTelemetryGrid"
      models={["(no Prisma model — Redis pub/sub sharding heartbeat, see packages/sharding)"]}
      description="Live shard ID, latency, and guild-count matrix across the cluster."
    />
  );
}
