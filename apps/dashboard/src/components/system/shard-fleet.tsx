"use client";

import { CircleSlash, Cpu, Network } from "lucide-react";
import type {
  ClusterReplicaView,
  ShardStateView,
  SystemShardsData,
} from "#/lib/dashboard-data";
import { Alert } from "#/components/ui/alert";
import { Badge } from "#/components/ui/badge";
import { Card, CardHeader, CardTitle, CardDescription } from "#/components/ui/card";
import { EmptyState } from "#/components/ui/empty-state";
import { ProgressRing } from "#/components/ui/progress-ring";
import { Table, TableScroll, TBody, TD, TH, THead, TR } from "#/components/ui/table";
import { cn } from "#/lib/utils";
import { since } from "#/lib/log-format";
import { useStaggerIn } from "#/lib/animate";

export const HealthyStatus = "Ready";
export const OfflineStatuses = new Set(["Disconnected", "Idle"]);
const SlowPingMs = 500;

function statusVariant(status: string) {
  if (status === HealthyStatus) return "success" as const;
  if (OfflineStatuses.has(status)) return "danger" as const;
  return "warning" as const;
}

function pluralize(
  count: number,
  singular: string,
  plural: string,
): string {
  return count === 1 ? singular : plural;
}

function shardRange(ids: number[]): string {
  if (ids.length === 0) return "none";
  const sorted = [...ids].sort((a, b) => a - b);
  const runs: string[] = [];
  let start = sorted[0]!;
  let prev = start;
  for (const id of sorted.slice(1)) {
    if (id === prev + 1) {
      prev = id;
      continue;
    }
    runs.push(start === prev ? `${start}` : `${start}–${prev}`);
    start = id;
    prev = id;
  }
  runs.push(start === prev ? `${start}` : `${start}–${prev}`);
  return runs.join(", ");
}

function ShardRows({
  shards,
  missing,
  observedAt,
}: {
  shards: ShardStateView[];
  missing: number[];
  observedAt: string;
}) {
  const rows = [
    ...shards.map((s) => ({ shardId: s.shardId, shard: s })),
    ...missing.map((shardId) => ({ shardId, shard: null })),
  ].sort((a, b) => a.shardId - b.shardId);
  const bodyRef = useStaggerIn<HTMLTableSectionElement>("tr", {
    resetKey: rows.map((r) => r.shardId).join(","),
  });

  return (
    <TableScroll>
      <Table>
        <THead>
          <TR>
            <TH className="w-16">Shard</TH>
            <TH>Status</TH>
            <TH className="text-right">Latency</TH>
            <TH className="text-right">Guilds</TH>
            <TH className="text-right">Last heartbeat</TH>
          </TR>
        </THead>
        <TBody ref={bodyRef}>
          {rows.map(({ shardId, shard }) =>
            shard ? (
              <TR key={shardId}>
                <TD className="font-mono tabular text-fg">{shardId}</TD>
                <TD>
                  <Badge variant={statusVariant(shard.status)} dot>
                    {shard.status}
                  </Badge>
                </TD>
                <TD
                  className={cn(
                    "tabular text-right font-mono",
                    shard.ping !== null && shard.ping >= SlowPingMs
                      ? "text-warning"
                      : "text-fg-muted",
                  )}
                >
                  {shard.ping === null ? "—" : `${shard.ping} ms`}
                </TD>
                <TD className="tabular text-right font-mono text-fg-muted">
                  {shard.guildCount}
                </TD>
                <TD className="tabular text-right font-mono text-fg-muted">
                  {since(shard.lastHeartbeatAt, observedAt)}
                </TD>
              </TR>
            ) : (
              <TR key={shardId} className="bg-danger-soft hover:bg-danger-soft">
                <TD className="font-mono tabular font-semibold text-danger">
                  {shardId}
                </TD>
                <TD colSpan={4}>
                  <span className="font-display flex items-center gap-1.5 text-[14px] font-semibold text-danger">
                    <CircleSlash className="size-3.5 shrink-0" aria-hidden />
                    Not reporting — no process is holding this shard
                  </span>
                </TD>
              </TR>
            ),
          )}
        </TBody>
      </Table>
    </TableScroll>
  );
}

function ReplicaCard({
  replica,
  shards,
  observedAt,
}: {
  replica: ClusterReplicaView;
  shards: ShardStateView[];
  observedAt: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex min-w-0 items-center gap-2">
          <Cpu className="size-3.5 shrink-0 text-fg-subtle" aria-hidden />
          <span className="truncate font-mono">{replica.replicaId}</span>
        </CardTitle>
        <CardDescription>
          Holds shard {shardRange(shards.map((s) => s.shardId))}
        </CardDescription>
      </CardHeader>
      <ShardRows shards={shards} missing={[]} observedAt={observedAt} />
    </Card>
  );
}

export function ShardFleet({ data }: { data: SystemShardsData }) {
  if (data.shards.length === 0 && data.shardCount === 0) {
    return (
      <Card>
        <EmptyState
          icon={Network}
          title="No shard has reported yet"
          description="Each gateway process publishes its shards every 10 seconds once it finishes connecting. Rows appear here as soon as the first worker is ready."
          footnote={`cluster ${data.clusterName}`}
        />
      </Card>
    );
  }

  const healthy = data.shards.filter((s) => s.status === HealthyStatus).length;

  return (
    <div className="flex flex-col gap-4">
      {data.shardCount > 0 ? (
        <div className="flex items-center gap-3">
          <ProgressRing
            value={(healthy / data.shardCount) * 100}
            size={44}
            strokeWidth={5}
          />
          <div>
            <p className="font-display text-[14px] font-semibold text-fg">
              {healthy} / {data.shardCount} shards healthy
            </p>
            <p className="text-[13px] text-fg-subtle">
              Ready and reporting, across the whole fleet.
            </p>
          </div>
        </div>
      ) : null}

      {data.missingShardIds.length > 0 ? (
        <Alert variant="danger">
          <p className="font-display font-semibold">
            {data.missingShardIds.length} of {data.shardCount} shards are not
            reporting
          </p>
          <p className="mt-0.5">
            Shard {shardRange(data.missingShardIds)} stopped publishing
            heartbeats, so the guilds on {pluralize(data.missingShardIds.length, "it", "them")}{" "}
            are receiving no gateway events. Check the gateway process that owns
            that range, or start a replacement covering it.
          </p>
        </Alert>
      ) : null}

      {data.replicas.map((replica) => {
        const shards = data.shards.filter((s) => s.replicaId === replica.replicaId);
        if (shards.length === 0) return null;
        return (
          <ReplicaCard
            key={replica.replicaId}
            replica={replica}
            shards={shards}
            observedAt={data.observedAt}
          />
        );
      })}

      {data.missingShardIds.length > 0 ? (
        <Card>
          <CardHeader actions={<Badge variant="danger" dot>Not reporting</Badge>}>
            <CardTitle>Shards with no process</CardTitle>
            <CardDescription>
              Shard {shardRange(data.missingShardIds)}{" "}
              {pluralize(data.missingShardIds.length, "is", "are")} within the
              cluster&apos;s shard count but no live process is reporting{" "}
              {pluralize(data.missingShardIds.length, "it", "them")}. Start another
              gateway replica, or lower TOTAL_SHARDS to match the fleet.
            </CardDescription>
          </CardHeader>
          <ShardRows shards={[]} missing={data.missingShardIds} observedAt={data.observedAt} />
        </Card>
      ) : null}
    </div>
  );
}
