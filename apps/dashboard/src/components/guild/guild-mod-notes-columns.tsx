import type { ColumnDef } from "@tanstack/react-table";
import { Button } from "#/components/ui/button";
import type { ModNoteView } from "#/lib/dashboard-data";
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

export function guildModNotesColumns({
  memberNames,
  onRemove,
}: {
  memberNames: Record<string, string>;
  onRemove: (note: ModNoteView) => void;
}): ColumnDef<ModNoteView>[] {
  return [
    {
      id: "message",
      header: "Note",
      accessorFn: (note) => note.message,
      meta: { className: "max-w-[28rem] whitespace-pre-wrap text-fg" },
    },
    {
      id: "author",
      header: "Author",
      accessorFn: (note) => note.authorId,
      meta: { className: "w-52" },
      cell: ({ row }) => <UserCell id={row.original.authorId} names={memberNames} />,
    },
    {
      id: "createdAt",
      header: "Added",
      accessorFn: (note) => note.createdAt,
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
          aria-label="Remove note"
          onClick={() => onRemove(row.original)}
        >
          Remove
        </Button>
      ),
    },
  ];
}
