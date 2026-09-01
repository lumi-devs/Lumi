import type { ColumnDef } from "@tanstack/react-table";
import type { dataTableFeatures } from "#/components/ui/data-table";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import type { ModerationCaseView } from "#/lib/dashboard-data";
import {
  ANONYMIZED_ID,
  caseActionLabel,
  formatCaseDate,
  formatDuration,
} from "#/lib/moderation-cases";

function UserCell({ id, name }: { id: string; name?: string }) {
  if (id === ANONYMIZED_ID) {
    return <span className="text-fg-subtle">Erased on request</span>;
  }
  return (
    <span className="flex flex-col">
      {name ? <span className="truncate text-fg">{name}</span> : null}
      <span className="tabular font-mono text-[13px] text-fg-subtle">{id}</span>
    </span>
  );
}

export function moderationCasesColumns({
  memberNames,
  onRevoke,
}: {
  memberNames: Record<string, string>;
  onRevoke: (moderationCase: ModerationCaseView) => void;
}): ColumnDef<typeof dataTableFeatures, ModerationCaseView>[] {
  return [
    {
      id: "caseNumber",
      header: "Case",
      accessorFn: (c) => c.caseNumber,
      meta: { className: "w-16 tabular font-mono text-[14px] text-fg-muted" },
      cell: ({ row }) => `#${row.original.caseNumber}`,
    },
    {
      id: "action",
      header: "Action",
      accessorFn: (c) => c.action,
      meta: { className: "w-28" },
      cell: ({ row }) => <Badge variant="neutral">{caseActionLabel(row.original.action)}</Badge>,
    },
    {
      id: "target",
      header: "Target",
      accessorFn: (c) => c.userId,
      cell: ({ row }) => (
        <UserCell id={row.original.userId} name={memberNames[row.original.userId]} />
      ),
    },
    {
      id: "moderator",
      header: "Moderator",
      accessorFn: (c) => c.moderatorId,
      cell: ({ row }) => (
        <UserCell id={row.original.moderatorId} name={memberNames[row.original.moderatorId]} />
      ),
    },
    {
      id: "reason",
      header: "Reason",
      accessorFn: (c) => c.reason ?? "",
      meta: { className: "max-w-[22rem] text-fg-muted" },
      cell: ({ row }) => (
        <span className="block truncate" title={row.original.reason ?? undefined}>
          {row.original.reason ?? "No reason recorded"}
        </span>
      ),
    },
    {
      id: "createdAt",
      header: "Created",
      accessorFn: (c) => c.createdAt,
      meta: { className: "w-44 whitespace-nowrap text-[14px] text-fg-muted" },
      cell: ({ row }) => {
        const c = row.original;
        return (
          <>
            <span className="tabular">{formatCaseDate(c.createdAt)}</span>
            {c.duration ? (
              <span className="block text-[13px] text-fg-subtle">
                Duration {formatDuration(c.duration)}
              </span>
            ) : null}
          </>
        );
      },
    },
    {
      id: "status",
      header: "Status",
      accessorFn: (c) => c.active,
      meta: { className: "w-24" },
      cell: ({ row }) => (
        <Badge variant={row.original.active ? "warning" : "neutral"} dot>
          {row.original.active ? "In effect" : "Revoked"}
        </Badge>
      ),
    },
    {
      id: "actions",
      header: () => <span className="sr-only">Row actions</span>,
      meta: { className: "w-24 text-right" },
      cell: ({ row }) => {
        const c = row.original;
        if (!c.active) return null;
        return (
          <Button
            variant="dangerGhost"
            size="sm"
            aria-label={`Revoke case #${c.caseNumber}`}
            onClick={() => onRevoke(c)}
          >
            Revoke
          </Button>
        );
      },
    },
  ];
}
