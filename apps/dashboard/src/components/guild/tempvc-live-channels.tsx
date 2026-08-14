"use client";

import { Eye, EyeOff, Lock, Radio, Unlock } from "lucide-react";
import { Badge, StatusDot } from "#/components/ui/badge";
import { EmptyState } from "#/components/ui/empty-state";
import type {
  DashboardMemberView,
  TempVcGeneratorView,
  TempVcRecordView,
} from "#/lib/dashboard-data";
import { formatCaseDate, formatDuration } from "#/lib/moderation-cases";
import { useStaggerIn } from "#/lib/animate";

export function TempVcLiveChannels({
  records,
  generators,
  members,
  channelNames,
  now,
}: {
  records: TempVcRecordView[];
  generators: TempVcGeneratorView[];
  members: DashboardMemberView[];
  channelNames: Record<string, string>;
  now: number;
}) {
  const liveChanRef = useStaggerIn<HTMLUListElement>("li");

  if (records.length === 0) {
    return (
      <EmptyState
        compact
        icon={Radio}
        title="Nothing live right now"
        description="Temporary channels show up here the moment someone joins a generator, and disappear again once the last person leaves."
      />
    );
  }

  const sorted = [...records].sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
  );

  return (
    <ul ref={liveChanRef} className="grid grid-cols-1 gap-px bg-border sm:grid-cols-2 xl:grid-cols-3">
      {sorted.map((record) => {
        const owner = members.find((m) => m.id === record.ownerId);
        const generator = generators.find(
          (g) => g.channelId === record.generatorId,
        );
        const elapsed = Math.max(
          0,
          Math.floor((now - Date.parse(record.createdAt)) / 1000),
        );

        return (
          <li key={record.channelId} className="flex flex-col gap-2 bg-surface p-3">
            <div className="flex items-start gap-2">
              <StatusDot active className="mt-1.5" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-[13px] font-semibold tracking-[0.01em] text-fg">
                  {record.name}
                </p>
                <p className="truncate text-[12px] text-fg-muted">
                  {owner ? owner.displayName || owner.username : "Owner left the server"}
                </p>
              </div>
              <span
                className="tabular shrink-0 text-[12px] text-fg-muted"
                title={formatCaseDate(record.createdAt)}
              >
                {formatDuration(elapsed)}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="neutral">
                {record.locked ? (
                  <Lock className="size-3" aria-hidden />
                ) : (
                  <Unlock className="size-3" aria-hidden />
                )}
                {record.locked ? "Locked" : "Open"}
              </Badge>
              <Badge variant="neutral">
                {record.hidden ? (
                  <EyeOff className="size-3" aria-hidden />
                ) : (
                  <Eye className="size-3" aria-hidden />
                )}
                {record.hidden ? "Hidden" : "Visible"}
              </Badge>
              <span className="truncate text-[11px] text-fg-subtle">
                from{" "}
                {generator
                  ? (channelNames[generator.channelId] ?? generator.channelId)
                  : "a generator that no longer exists"}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
