import type { ColumnDef } from "@tanstack/react-table";
import type { dataTableFeatures } from "#/components/ui/data-table";
import type { AfkEntryView, DashboardMemberView } from "#/lib/dashboard-data";
import { formatCaseDate, formatDuration } from "#/lib/moderation-cases";

export function afkColumns({
  members,
  now,
}: {
  members: DashboardMemberView[];
  now: number;
}): ColumnDef<typeof dataTableFeatures, AfkEntryView>[] {
  return [
    {
      id: "member",
      header: "Member",
      accessorFn: (entry) => entry.userId,
      cell: ({ row }) => {
        const member = members.find((m) => m.id === row.original.userId);
        return (
          <span className="flex flex-col">
            {member ? (
              <span className="truncate text-fg">
                {member.displayName || member.username}
              </span>
            ) : null}
            <span className="tabular font-mono text-[13px] text-fg-subtle">
              {row.original.userId}
            </span>
          </span>
        );
      },
    },
    {
      id: "message",
      header: "Message",
      accessorFn: (entry) => entry.reason,
      meta: { className: "max-w-[24rem] text-fg-muted" },
      cell: ({ row }) => (
        <span className="block truncate" title={row.original.reason}>
          {row.original.reason || "No message"}
        </span>
      ),
    },
    {
      id: "awayFor",
      header: "Away for",
      accessorFn: (entry) => entry.since,
      meta: { className: "w-28 tabular text-fg-muted" },
      cell: ({ row }) => {
        const elapsed = Math.max(
          0,
          Math.floor((now - Date.parse(row.original.since)) / 1000),
        );
        return formatDuration(elapsed);
      },
    },
    {
      id: "since",
      header: "Since",
      accessorFn: (entry) => entry.since,
      meta: { className: "w-44 tabular whitespace-nowrap text-[14px] text-fg-muted" },
      cell: ({ row }) => formatCaseDate(row.original.since),
    },
  ];
}
