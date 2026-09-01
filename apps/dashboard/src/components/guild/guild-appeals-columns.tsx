import type { ColumnDef } from "@tanstack/react-table";
import type { dataTableFeatures } from "#/components/ui/data-table";
import type { AppealReviewStatus } from "@lumi/contracts";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import type { AppealView } from "#/lib/dashboard-data";
import { APPEAL_STATUS_BADGE_VARIANT, APPEAL_STATUS_LABELS } from "#/lib/appeals";
import { caseActionLabel, formatCaseDate } from "#/lib/moderation-cases";

function UserCell({ id, names }: { id: string; names: Record<string, string> }) {
  const name = names[id];
  return (
    <span className="flex flex-col">
      {name ? <span className="truncate text-fg">{name}</span> : null}
      <span className="tabular font-mono text-[13px] text-fg-subtle">{id}</span>
    </span>
  );
}

export function guildAppealsColumns({
  memberNames,
  onReview,
}: {
  memberNames: Record<string, string>;
  onReview: (appeal: AppealView, status: AppealReviewStatus) => void;
}): ColumnDef<typeof dataTableFeatures, AppealView>[] {
  return [
    {
      id: "case",
      header: "Case",
      accessorFn: (appeal) => appeal.caseNumber,
      meta: { className: "w-32 whitespace-nowrap" },
      cell: ({ row }) => (
        <span className="flex flex-col">
          <span className="tabular text-fg">#{row.original.caseNumber}</span>
          <span className="text-[13px] text-fg-subtle">
            {caseActionLabel(row.original.action)}
          </span>
        </span>
      ),
    },
    {
      id: "member",
      header: "Member",
      accessorFn: (appeal) => appeal.userId,
      meta: { className: "w-52" },
      cell: ({ row }) => <UserCell id={row.original.userId} names={memberNames} />,
    },
    {
      id: "message",
      header: "Appeal",
      accessorFn: (appeal) => appeal.message,
      meta: { className: "max-w-[24rem] whitespace-pre-wrap text-fg" },
    },
    {
      id: "status",
      header: "Status",
      accessorFn: (appeal) => appeal.status,
      meta: { className: "w-40" },
      cell: ({ row }) => {
        const appeal = row.original;
        return (
          <span className="flex flex-col gap-1">
            <Badge variant={APPEAL_STATUS_BADGE_VARIANT[appeal.status]}>
              {APPEAL_STATUS_LABELS[appeal.status]}
            </Badge>
            {appeal.reviewedBy ? (
              <span className="text-[13px] text-fg-subtle">
                by {memberNames[appeal.reviewedBy] ?? appeal.reviewedBy}
                {appeal.reviewedAt ? ` · ${formatCaseDate(appeal.reviewedAt)}` : ""}
              </span>
            ) : null}
          </span>
        );
      },
    },
    {
      id: "createdAt",
      header: "Submitted",
      accessorFn: (appeal) => appeal.createdAt,
      meta: { className: "w-44 tabular whitespace-nowrap text-[14px] text-fg-muted" },
      cell: ({ row }) => formatCaseDate(row.original.createdAt),
    },
    {
      id: "actions",
      header: () => <span className="sr-only">Review</span>,
      meta: { className: "w-64 text-right" },
      cell: ({ row }) => {
        const appeal = row.original;
        if (appeal.status !== "pending") return null;
        return (
          <div className="flex flex-wrap justify-end gap-1.5">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onReview(appeal, "approved")}
            >
              Approve
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onReview(appeal, "dismissed")}
            >
              Dismiss
            </Button>
            <Button
              variant="dangerGhost"
              size="sm"
              onClick={() => onReview(appeal, "denied")}
            >
              Deny
            </Button>
            <Button
              variant="dangerGhost"
              size="sm"
              onClick={() => onReview(appeal, "denied_blacklisted")}
            >
              Deny + Blacklist
            </Button>
          </div>
        );
      },
    },
  ];
}
