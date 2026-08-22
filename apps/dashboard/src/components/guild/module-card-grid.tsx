"use client";

import Link from "next/link";
import { PackageOpen } from "lucide-react";
import { toggleGuildModule } from "#/actions/guild-actions";
import { Switch } from "#/components/ui/switch";
import { Card } from "#/components/ui/card";
import { Badge } from "#/components/ui/badge";
import { Glyph } from "#/components/ui/glyph";
import { EmptyState } from "#/components/ui/empty-state";
import { ActionError } from "#/components/action-error";
import { TiltCard } from "#/components/motion/tilt-card";
import { spotlightHandler } from "#/lib/animate";
import { useOptimisticAction } from "#/lib/use-server-action";
import type { DashboardModuleView } from "#/lib/dashboard-data";

export function ModuleCardGrid({
  guildId,
  modules,
}: {
  guildId: string;
  modules: DashboardModuleView[];
}) {
  if (modules.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={PackageOpen}
          title="No modules available"
          description="This guild's worker reported no loadable modules. Check that the bot process started cleanly."
        />
      </Card>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {modules.map((m) => (
        <ModuleCard key={m.name} guildId={guildId} module={m} />
      ))}
    </div>
  );
}

function ModuleCard({
  guildId,
  module: m,
}: {
  guildId: string;
  module: DashboardModuleView;
}) {
  const isCore = m.name === "core";
  const { value: enabled, isPending, error, run } = useOptimisticAction(m.enabled);
  const on = enabled || isCore;

  return (
    <TiltCard className="h-full">
      <Card
        className="spotlight flex h-full flex-col gap-2.5 p-4 transition-colors hover:border-border-strong"
        onMouseMove={spotlightHandler}
      >
      <div className="flex items-start justify-between gap-2">
        <Glyph emoji={m.emoji} className="size-8.5 text-[17px]" />
        {isCore ? (
          <Badge variant="neutral">Always on</Badge>
        ) : (
          <Switch
            checked={enabled}
            onChange={(next) =>
              run(
                next,
                () => toggleGuildModule(guildId, m.name, next),
                "Failed to toggle",
              )
            }
            disabled={isPending}
            aria-label={`Toggle ${m.displayName}`}
          />
        )}
      </div>

      <Link
        href={`/guild/${guildId}/modules/${m.name}`}
        className="font-display truncate text-[15.5px] font-semibold tracking-[0.01em] text-fg hover:underline"
      >
        {m.displayName}
      </Link>

      <p className="line-clamp-2 text-[14px] leading-5 text-fg-muted">
        {m.description}
      </p>

      <div className="tabular mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[12.5px] text-fg-subtle">
        <span className={on ? "text-success" : undefined}>
          {on ? "● active" : "○ disabled"}
        </span>
        <span>
          {m.configFields.length} field{m.configFields.length === 1 ? "" : "s"}
        </span>
        <span>{m.isAddon ? `addon v${m.version}` : `v${m.version}`}</span>
      </div>

      <ActionError error={error} />
      </Card>
    </TiltCard>
  );
}
