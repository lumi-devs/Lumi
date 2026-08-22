import type { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal } from "lucide-react";
import { hasSequencePlaceholder, resolveName } from "#/components/guild/tempvc-generators";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import type {
  DashboardChannelView,
  TempVcGeneratorView,
} from "#/lib/dashboard-data";

export function tempvcGeneratorsColumns({
  channels,
  onEdit,
  onRemove,
}: {
  channels: DashboardChannelView[];
  onEdit: (generator: TempVcGeneratorView) => void;
  onRemove: (generator: TempVcGeneratorView) => void;
}): ColumnDef<TempVcGeneratorView>[] {
  return [
    {
      id: "trigger",
      header: "Join this channel",
      accessorFn: (g) => g.channelId,
      cell: ({ row }) => {
        const generator = row.original;
        const channel = channels.find((c) => c.id === generator.channelId);
        return (
          <span className="flex flex-col">
            <span className="flex items-center gap-2 text-fg">
              {channel ? `🔊 ${channel.name}` : "Channel not found"}
              {channel ? null : (
                <Badge variant="danger" dot>
                  Never fires
                </Badge>
              )}
            </span>
            <span className="tabular font-mono text-[13px] text-fg-subtle">
              {generator.channelId}
            </span>
          </span>
        );
      },
    },
    {
      id: "creates",
      header: "Creates",
      accessorFn: (g) => g.name,
      cell: ({ row }) => {
        const generator = row.original;
        const sequenced = hasSequencePlaceholder(generator.name);
        return (
          <span className="flex flex-col">
            <span className="text-fg">
              {sequenced
                ? `${resolveName(generator.name, 1)}, ${resolveName(generator.name, 2)}, …`
                : resolveName(generator.name, 1)}
            </span>
            <span className="font-mono text-[13px] text-fg-subtle">
              {generator.name}
            </span>
          </span>
        );
      },
    },
    {
      id: "limit",
      header: "User limit",
      accessorFn: (g) => g.limit,
      meta: { className: "w-28 tabular text-fg-muted" },
      cell: ({ row }) =>
        row.original.limit > 0 ? row.original.limit : "No limit",
    },
    {
      id: "actions",
      header: () => <span className="sr-only">Row actions</span>,
      meta: { className: "w-16 text-right" },
      cell: ({ row }) => {
        const generator = row.original;
        const channel = channels.find((c) => c.id === generator.channelId);
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Actions for the generator on ${channel?.name ?? generator.channelId}`}
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => onEdit(generator)}>
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => onRemove(generator)}
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
