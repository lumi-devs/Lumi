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
import { cn } from "#/lib/utils";
import type { DashboardModuleView } from "#/lib/dashboard-data";

export function ModuleCardGrid({
  guildId,
  modules,
  alertsByModule,
}: {
  guildId: string;
  modules: DashboardModuleView[];
  /** Failing-health-check count per module name, if known. No fabricated alerts. */
  alertsByModule?: Record<string, number>;
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
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {modules.map((m) => (
        <ModuleCard
          key={m.name}
          guildId={guildId}
          module={m}
          alertCount={alertsByModule?.[m.name] ?? 0}
        />
      ))}
    </div>
  );
}

function ModuleCard({
  guildId,
  module: m,
  alertCount,
}: {
  guildId: string;
  module: DashboardModuleView;
  alertCount: number;
}) {
  const isCore = m.name === "core";
  const { value: enabled, isPending, error, run } = useOptimisticAction(m.enabled);
  const on = enabled || isCore;
  const hasAlert = alertCount > 0;
  const href = `/guild/${guildId}/${m.dashboardHref ?? `config/modules/${m.name}`}`;

  return (
    <TiltCard className="h-full">
      <Card
        className={cn(
          "spotlight flex h-full flex-col gap-3.5 p-4.5 transition-colors hover:border-border-strong",
          hasAlert && "border-warning/35",
        )}
        onMouseMove={spotlightHandler}
      >
      <div className="flex items-center justify-between gap-2">
        <Glyph
          emoji={m.emoji}
          className={cn("size-8.5 text-[17px]", hasAlert && "border-warning text-warning")}
        />
        {isCore ? (
          <Badge variant="neutral">Always on</Badge>
        ) : hasAlert ? (
          <Badge variant="warning">
            {alertCount} alert{alertCount === 1 ? "" : "s"}
          </Badge>
        ) : (
          <Badge variant={on ? "success" : "neutral"} dot>
            {on ? "Active" : "Disabled"}
          </Badge>
        )}
      </div>

      <div>
        <Link
          href={href}
          className="font-display truncate text-[15.5px] font-semibold tracking-[0.01em] text-fg hover:underline"
        >
          {m.displayName}
        </Link>
        <p className="mt-0.5 line-clamp-2 min-h-10 text-[14px] leading-5 text-fg-muted">
          {m.short || m.description}
        </p>
      </div>

      <div className="tabular mt-auto flex items-center justify-between gap-2 border-t border-border-soft pt-3 font-mono text-[12px] text-fg-subtle">
        <span>
          {m.configFields.length} field{m.configFields.length === 1 ? "" : "s"}
          {" · "}
          {m.isAddon ? `addon v${m.version}` : `v${m.version}`}
        </span>
        {isCore ? null : (
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

      <ActionError error={error} />
      </Card>
    </TiltCard>
  );
}
