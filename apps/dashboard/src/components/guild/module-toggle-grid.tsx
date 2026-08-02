"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toggleGuildModule } from "#/actions/guild-actions";
import { Switch } from "#/components/ui/switch";
import { Card } from "#/components/ui/card";
import { Badge } from "#/components/ui/badge";
import type { DashboardModuleView } from "#/lib/dashboard-data";

/** dashboard.md §9B `GuildModuleToggleSidebar` (rendered here as a grid, matching step 6's "toggle grid" ask). */
export function ModuleToggleGrid({
  guildId,
  modules,
}: {
  guildId: string;
  modules: DashboardModuleView[];
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
  const [enabled, setEnabled] = useState(m.enabled);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleToggle(next: boolean) {
    const prev = enabled;
    setEnabled(next);
    setError(null);
    startTransition(async () => {
      const res = await toggleGuildModule(guildId, m.name, next);
      if (!res.ok) {
        setEnabled(prev);
        setError(res.error ?? "Failed to toggle");
      }
    });
  }

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <Link
          href={`/guild/${guildId}/modules/${m.name}`}
          className="flex min-w-0 items-center gap-2.5"
        >
          <span className="text-xl">{m.emoji}</span>
          <span className="truncate text-sm font-semibold hover:text-accent-cyan">
            {m.displayName}
          </span>
        </Link>
        {isCore ? (
          <Badge>Always active</Badge>
        ) : (
          <Switch
            checked={enabled}
            onChange={handleToggle}
            disabled={isPending}
            aria-label={`Toggle ${m.displayName}`}
          />
        )}
      </div>
      <p className="text-xs text-white/50">{m.description}</p>
      {error && <p className="text-xs text-danger">{error}</p>}
      <span className="text-xs text-white/30">
        {m.configFields.length} config field
        {m.configFields.length === 1 ? "" : "s"}
      </span>
    </Card>
  );
}
