import type { ColumnDef } from "@tanstack/react-table";
import type { dataTableFeatures } from "#/components/ui/data-table";
import { MoreHorizontal } from "lucide-react";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import type { ReactionRoleMenuView } from "#/lib/dashboard-data";

export function modeLabel(mode: ReactionRoleMenuView["mode"]): string {
  if (mode === "select") return "Dropdown";
  if (mode === "reactions") return "Reactions";
  return "Buttons";
}

export function reactionrolesColumns({
  onEdit,
  onRemove,
}: {
  onEdit: (menu: ReactionRoleMenuView) => void;
  onRemove: (menu: ReactionRoleMenuView) => void;
}): ColumnDef<typeof dataTableFeatures, ReactionRoleMenuView>[] {
  return [
    {
      id: "menu",
      header: "Menu",
      accessorFn: (m) => m.title,
      cell: ({ row }) => {
        const menu = row.original;
        return (
          <span className="flex flex-col">
            <span className="text-fg">🎭 {menu.title}</span>
            <span className="font-mono text-[13px] text-fg-subtle">
              {menu.id}
            </span>
          </span>
        );
      },
    },
    {
      id: "mode",
      header: "Mode",
      accessorFn: (m) => m.mode,
      meta: { className: "w-28" },
      cell: ({ row }) => (
        <Badge variant="neutral">{modeLabel(row.original.mode)}</Badge>
      ),
    },
    {
      id: "options",
      header: "Options",
      accessorFn: (m) => m.options.length,
      meta: { className: "w-24 tabular text-fg-muted" },
      cell: ({ row }) => row.original.options.length,
    },
    {
      id: "rules",
      header: "Rules",
      accessorFn: (m) => (m.exclusive ? "exclusive" : `up to ${m.maxRoles}`),
      cell: ({ row }) => {
        const menu = row.original;
        return (
          <span className="text-fg-muted">
            {menu.exclusive ? "Pick one" : `Up to ${menu.maxRoles}`}
          </span>
        );
      },
    },
    {
      id: "status",
      header: "Status",
      accessorFn: (m) => m.messageIds.length,
      meta: { className: "w-28" },
      cell: ({ row }) =>
        row.original.messageIds.length > 0 ? (
          <Badge variant="success" dot>
            Posted
          </Badge>
        ) : (
          <Badge variant="neutral">Draft</Badge>
        ),
    },
    {
      id: "actions",
      header: () => <span className="sr-only">Row actions</span>,
      meta: { className: "w-16 text-right" },
      cell: ({ row }) => {
        const menu = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Actions for the ${menu.title} menu`}
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => onEdit(menu)}>
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => onRemove(menu)}
              >
                Remove
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];
}
