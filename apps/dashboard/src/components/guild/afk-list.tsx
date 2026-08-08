import { Moon } from "lucide-react";
import { afkColumns } from "#/components/guild/afk-columns";
import { DataTable } from "#/components/ui/data-table";
import { EmptyState } from "#/components/ui/empty-state";
import type { AfkEntryView, DashboardMemberView } from "#/lib/dashboard-data";

export function AfkList({
  entries,
  members,
  now,
}: {
  entries: AfkEntryView[];
  members: DashboardMemberView[];
  now: number;
}) {
  if (entries.length === 0) {
    return (
      <EmptyState
        compact
        icon={Moon}
        title="Nobody is away"
        description="Members mark themselves away with Lumi's AFK command, and clear it by talking again. There's nothing to set up here."
      />
    );
  }

  const sorted = [...entries].sort(
    (a, b) => Date.parse(a.since) - Date.parse(b.since),
  );
  const columns = afkColumns({ members, now });

  return <DataTable columns={columns} data={sorted} getRowId={(entry) => entry.userId} />;
}
