import { Database } from "lucide-react";
import { DataTable } from "#/components/ui/data-table";
import { EmptyState } from "#/components/ui/empty-state";
import { moduleDataColumns } from "#/components/guild/module-data-columns";
import type {
  DashboardModuleView,
  ModuleDataEntryView,
} from "#/lib/dashboard-data";

export function ModuleDataTable({
  entries,
  modules,
}: {
  entries: ModuleDataEntryView[];
  modules: DashboardModuleView[];
}) {
  if (entries.length === 0) {
    return (
      <EmptyState
        compact
        icon={Database}
        title="No stored values match"
        description="Modules write here as they run — a starboard's posted messages, a giveaway's entrants. An empty result usually means the module hasn't needed to store anything yet."
      />
    );
  }

  const columns = moduleDataColumns(modules);

  return (
    <DataTable
      columns={columns}
      data={entries}
      getRowId={(entry) => `${entry.moduleName}:${entry.targetId}:${entry.key}`}
    />
  );
}
