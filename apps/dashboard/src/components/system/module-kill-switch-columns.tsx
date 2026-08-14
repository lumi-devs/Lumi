import type { ColumnDef } from "@tanstack/react-table";
import { X } from "lucide-react";
import { Badge } from "#/components/ui/badge";
import { Switch } from "#/components/ui/switch";
import { Button } from "#/components/ui/button";
import type { GlobalModuleStateView } from "#/lib/dashboard-data";

export function moduleKillSwitchColumns({
  isPending,
  onToggle,
  onClear,
}: {
  isPending: boolean;
  onToggle: (moduleName: string, enabled: boolean) => void;
  onClear: (moduleName: string) => void;
}): ColumnDef<GlobalModuleStateView>[] {
  return [
    {
      id: "module",
      header: "Module",
      accessorFn: (r) => r.moduleName,
      meta: { className: "w-56 font-mono text-[12px] text-fg" },
    },
    {
      id: "reason",
      header: "Reason",
      accessorFn: (r) => r.reason ?? "",
      meta: { className: "text-fg-muted" },
      cell: ({ row }) =>
        row.original.reason ?? (
          <span className="text-fg-subtle">No reason recorded</span>
        ),
    },
    {
      id: "state",
      header: "State",
      accessorFn: (r) => r.enabled,
      meta: { className: "w-24 text-right" },
      cell: ({ row }) => {
        const r = row.original;
        return (
          <div className="flex items-center justify-end gap-2">
            <Badge variant={r.enabled ? "success" : "danger"} dot>
              {r.enabled ? "On" : "Off"}
            </Badge>
            <Switch
              checked={r.enabled}
              onChange={(v) => onToggle(r.moduleName, v)}
              disabled={isPending}
              aria-label={`Toggle ${r.moduleName} globally`}
            />
          </div>
        );
      },
    },
    {
      id: "clear",
      header: "",
      meta: { className: "w-10 text-right" },
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="icon"
          disabled={isPending}
          onClick={() => onClear(row.original.moduleName)}
          title="Remove override — module reverts to per-guild config"
          aria-label={`Remove global override for ${row.original.moduleName}`}
        >
          <X aria-hidden />
        </Button>
      ),
    },
  ];
}
