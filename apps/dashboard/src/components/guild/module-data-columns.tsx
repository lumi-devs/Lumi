import type { ColumnDef } from "@tanstack/react-table";
import { Glyph } from "#/components/ui/glyph";
import type {
  DashboardModuleView,
  ModuleDataEntryView,
} from "#/lib/dashboard-data";

export function moduleDataColumns(
  modules: DashboardModuleView[],
): ColumnDef<ModuleDataEntryView>[] {
  return [
    {
      id: "module",
      header: "Module",
      accessorFn: (entry) => entry.moduleName,
      meta: { className: "w-48" },
      cell: ({ row }) => {
        const owner = modules.find((m) => m.name === row.original.moduleName);
        return (
          <span className="flex items-center gap-2">
            {owner ? <Glyph emoji={owner.emoji} size="sm" /> : null}
            <span className="truncate text-fg">
              {owner?.displayName ?? row.original.moduleName}
            </span>
          </span>
        );
      },
    },
    {
      id: "target",
      header: "Target",
      accessorFn: (entry) => entry.targetId,
      meta: { className: "w-48 tabular font-mono text-[11px] text-fg-muted" },
    },
    {
      id: "key",
      header: "Key",
      accessorFn: (entry) => entry.key,
      meta: { className: "w-56 font-mono text-[12px] text-fg" },
    },
    {
      id: "value",
      header: "Value",
      accessorFn: (entry) => JSON.stringify(entry.value),
      meta: { className: "max-w-[26rem] font-mono text-[11px] text-fg-muted" },
      cell: ({ row }) => {
        const value = JSON.stringify(row.original.value);
        return (
          <span className="block truncate" title={value}>
            {value}
          </span>
        );
      },
    },
  ];
}
