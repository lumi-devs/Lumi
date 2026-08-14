"use client";

import Link from "next/link";
import { ChevronRight, PackageOpen } from "lucide-react";
import { toggleGuildModule } from "#/actions/guild-actions";
import { Switch } from "#/components/ui/switch";
import { Card } from "#/components/ui/card";
import { Badge } from "#/components/ui/badge";
import { Glyph } from "#/components/ui/glyph";
import { EmptyState } from "#/components/ui/empty-state";
import { useStaggerIn } from "#/lib/animate";
import { ActionError } from "#/components/action-error";
import { useOptimisticAction } from "#/lib/use-server-action";
import type { DashboardModuleView } from "#/lib/dashboard-data";

export function ModuleToggleGrid({
  guildId,
  modules,
  emptyTitle = "No modules available",
  emptyDescription = "This guild's worker reported no loadable modules. Check that the bot process started cleanly.",
}: {
  guildId: string;
  modules: DashboardModuleView[];
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  const listRef = useStaggerIn<HTMLUListElement>("li", { resetKey: guildId });

  if (modules.length === 0) {
    return (
      <Card>
        <EmptyState icon={PackageOpen} title={emptyTitle} description={emptyDescription} />
      </Card>
    );
  }

  return (
    <Card>
      <ul ref={listRef} className="divide-y divide-border">
        {modules.map((m) => (
          <ModuleRow key={m.name} guildId={guildId} module={m} />
        ))}
      </ul>
    </Card>
  );
}

function ModuleRow({
  guildId,
  module: m,
}: {
  guildId: string;
  module: DashboardModuleView;
}) {
  const isCore = m.name === "core";
  const { value: enabled, isPending, error, run } = useOptimisticAction(m.enabled);

  function handleToggle(next: boolean) {
    run(next, () => toggleGuildModule(guildId, m.name, next), "Failed to toggle");
  }

  return (
    <li className="group flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-surface-hover">
      <Glyph emoji={m.emoji} />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Link
            href={`/guild/${guildId}/modules/${m.name}`}
            className="font-display truncate text-[13px] font-semibold tracking-[0.01em] text-fg hover:underline"
          >
            {m.displayName}
          </Link>
          <span className="hidden font-mono text-[11px] text-fg-subtle sm:inline">
            {m.name}
          </span>
        </div>
        <p className="truncate text-[12px] leading-5 text-fg-muted">
          {m.description}
        </p>
        <ActionError error={error} className="mt-1.5" />
      </div>

      <span className="tabular hidden w-24 shrink-0 text-right text-[12px] text-fg-subtle lg:block">
        {m.configFields.length} field{m.configFields.length === 1 ? "" : "s"}
      </span>

      <div className="flex w-24 shrink-0 justify-end">
        {isCore ? (
          <Badge variant="neutral">Always active</Badge>
        ) : (
          <Switch
            checked={enabled}
            onChange={handleToggle}
            disabled={isPending}
            aria-label={`Toggle ${m.displayName}`}
          />
        )}
      </div>

      <Link
        href={`/guild/${guildId}/modules/${m.name}`}
        aria-label={`Configure ${m.displayName}`}
        className="flex size-6 shrink-0 items-center justify-center rounded text-fg-subtle transition-colors hover:bg-surface-active hover:text-fg"
      >
        <ChevronRight className="size-4" aria-hidden />
      </Link>
    </li>
  );
}
