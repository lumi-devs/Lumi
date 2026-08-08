import type { ColumnDef } from "@tanstack/react-table";
import { Button } from "#/components/ui/button";
import type { BlocklistEntryView } from "#/lib/dashboard-data";
import { formatCaseDate } from "#/lib/moderation-cases";

function UserCell({ id, names }: { id: string; names: Record<string, string> }) {
  const name = names[id];
  return (
    <span className="flex flex-col">
      {name ? <span className="truncate text-fg">{name}</span> : null}
      <span className="tabular font-mono text-[11px] text-fg-subtle">{id}</span>
    </span>
  );
}

export function guildBlocklistColumns({
  memberNames,
  onUnblock,
}: {
  memberNames: Record<string, string>;
  onUnblock: (entry: BlocklistEntryView) => void;
}): ColumnDef<BlocklistEntryView>[] {
  return [
    {
      id: "user",
      header: "User",
      accessorFn: (entry) => entry.userId,
      cell: ({ row }) => <UserCell id={row.original.userId} names={memberNames} />,
    },
    {
      id: "reason",
      header: "Reason",
      accessorFn: (entry) => entry.reason ?? "",
      meta: { className: "max-w-[22rem] text-fg-muted" },
      cell: ({ row }) => (
        <span className="block truncate" title={row.original.reason ?? undefined}>
          {row.original.reason ?? "No reason recorded"}
        </span>
      ),
    },
    {
      id: "blockedBy",
      header: "Blocked by",
      accessorFn: (entry) => entry.blockedBy,
      meta: { className: "w-52" },
      cell: ({ row }) => <UserCell id={row.original.blockedBy} names={memberNames} />,
    },
    {
      id: "createdAt",
      header: "Blocked",
      accessorFn: (entry) => entry.createdAt,
      meta: { className: "w-44 tabular whitespace-nowrap text-[12px] text-fg-muted" },
      cell: ({ row }) => formatCaseDate(row.original.createdAt),
    },
    {
      id: "actions",
      header: () => <span className="sr-only">Row actions</span>,
      meta: { className: "w-24 text-right" },
      cell: ({ row }) => (
        <Button
          variant="dangerGhost"
          size="sm"
          aria-label={`Unblock ${row.original.userId}`}
          onClick={() => onUnblock(row.original)}
        >
          Unblock
        </Button>
      ),
    },
  ];
}
