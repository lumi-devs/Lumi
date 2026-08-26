import Link from "next/link";
import { ArrowRight, LayoutGrid } from "lucide-react";
import { Card } from "#/components/ui/card";
import type { DashboardModuleView } from "#/lib/dashboard-data";

export function ModulesStatusStrip({
  guildId,
  modules,
}: {
  guildId: string;
  modules: DashboardModuleView[];
}) {
  const enabledCount = modules.filter((m) => m.enabled || m.name === "core").length;
  const off = modules.filter((m) => !m.enabled && m.name !== "core" && !m.isAddon);

  return (
    <Card className="flex items-center gap-3 px-4 py-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-control bg-accent-soft text-accent-fg">
        <LayoutGrid className="size-4" aria-hidden />
      </span>
      <p className="min-w-0 flex-1 truncate text-[14.5px] text-fg-muted">
        <span className="font-medium text-fg">Modules</span> ·{" "}
        <span className="tabular font-mono">
          {enabledCount} of {modules.length} on
        </span>
        {off.length > 0 ? (
          <>
            {" "}
            ·{" "}
            <span className="text-warning-fg">
              {off.map((m) => m.displayName).join(", ")} off
            </span>
          </>
        ) : null}
      </p>
      <Link
        href={`/guild/${guildId}/modules`}
        className="flex shrink-0 items-center gap-1 text-[14px] font-medium text-accent-fg hover:underline"
      >
        Manage modules
        <ArrowRight className="size-3.5" aria-hidden />
      </Link>
    </Card>
  );
}
