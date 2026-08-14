import Link from "next/link";
import { cn } from "#/lib/utils";
import { since } from "#/lib/log-format";
import {
  fieldLabel,
  fieldType,
  moduleLabel,
  resolveConfigValue,
  type ModuleLabelIndex,
} from "#/lib/config-labels";
import { HEALTHY_STATUS, OFFLINE_STATUSES } from "#/components/system/shard-fleet";
import type {
  ConfigHistoryEntryView,
  DashboardChannelView,
  DashboardRoleView,
  SystemShardsData,
} from "#/lib/dashboard-data";

export function OverviewRail({
  shards,
  changes,
  actorNames,
  labels,
  roles,
  channels,
  renderedAt,
  className,
}: {
  className?: string;
  /** Owner-only telemetry; `null` for non-owners and when the read failed. */
  shards: SystemShardsData | null;
  changes: ConfigHistoryEntryView[];
  actorNames: Record<string, string>;
  labels: ModuleLabelIndex;
  roles: DashboardRoleView[];
  channels: DashboardChannelView[];
  /** Server render time, used as the reference for every "x ago" label. */
  renderedAt: string;
}) {
  return (
    <aside
      className={cn(
        "flex flex-col gap-6 border-border-soft xl:sticky xl:top-19 xl:h-fit xl:border-l xl:pl-5",
        className,
      )}
    >
      {shards ? <ShardHealth shards={shards} /> : null}
      <RecentChanges
        changes={changes}
        actorNames={actorNames}
        labels={labels}
        roles={roles}
        channels={channels}
        renderedAt={renderedAt}
      />
    </aside>
  );
}

function RailHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="font-display mb-3 text-[11px] font-semibold tracking-[0.07em] text-fg-subtle uppercase">
      {children}
    </h3>
  );
}

function ShardHealth({ shards }: { shards: SystemShardsData }) {
  const byId = new Map(shards.shards.map((s) => [s.shardId, s]));
  const ids = Array.from({ length: shards.shardCount }, (_, i) => i);

  return (
    <div>
      <RailHeading>Shard health</RailHeading>
      <div className="grid grid-cols-4 gap-1.5">
        {ids.map((id) => {
          const shard = byId.get(id);
          const tone = !shard
            ? "bad"
            : shard.status === HEALTHY_STATUS
              ? "good"
              : OFFLINE_STATUSES.has(shard.status)
                ? "bad"
                : "warn";
          return (
            <span
              key={id}
              title={
                shard
                  ? `Shard ${id} — ${shard.status}${shard.ping === null ? "" : `, ${shard.ping}ms`}`
                  : `Shard ${id} — not reporting`
              }
              className={cn(
                "tabular flex aspect-square items-center justify-center rounded-[6px] border font-mono text-[10px]",
                tone === "good" &&
                  "border-success/35 bg-success-soft text-success",
                tone === "warn" &&
                  "border-warning/35 bg-warning-soft text-warning",
                tone === "bad" && "border-danger/35 bg-danger-soft text-danger",
              )}
            >
              S{id}
            </span>
          );
        })}
      </div>
      <p className="mt-2.5 font-mono text-[10.5px] text-fg-subtle">
        <Link href="/system/shards" className="hover:text-fg">
          {shards.clusterName} · {shards.shards.length}/{shards.shardCount}{" "}
          reporting →
        </Link>
      </p>
    </div>
  );
}

function RecentChanges({
  changes,
  actorNames,
  labels,
  roles,
  channels,
  renderedAt,
}: {
  changes: ConfigHistoryEntryView[];
  actorNames: Record<string, string>;
  labels: ModuleLabelIndex;
  roles: DashboardRoleView[];
  channels: DashboardChannelView[];
  renderedAt: string;
}) {
  return (
    <div>
      <RailHeading>Recent changes</RailHeading>
      {changes.length === 0 ? (
        <p className="text-[12px] leading-5 text-fg-muted">
          No settings have been changed yet. Every edit made here or from
          Discord shows up in this column.
        </p>
      ) : (
        <ul className="flex flex-col">
          {changes.map((entry) => (
            <li
              key={entry.id}
              className="flex gap-2.5 border-b border-border-soft py-2.5 last:border-b-0"
            >
              <span
                aria-hidden
                className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent"
              />
              <div className="min-w-0">
                <p className="text-[12px] leading-[1.45] text-fg-muted">
                  <span className="font-semibold text-fg">
                    {moduleLabel(labels, entry.moduleName)} →{" "}
                    {fieldLabel(labels, entry.moduleName, entry.key)}
                  </span>{" "}
                  set to{" "}
                  <span className="font-mono text-fg">
                    {truncate(
                      resolveConfigValue(
                        fieldType(labels, entry.moduleName, entry.key),
                        entry.newValue,
                        roles,
                        channels,
                      ),
                    )}
                  </span>
                </p>
                <p className="tabular mt-0.5 font-mono text-[10px] text-fg-subtle">
                  {actorNames[entry.actorId] ?? entry.actorId} ·{" "}
                  {since(entry.createdAt, renderedAt)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function truncate(value: string, max = 40): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}
