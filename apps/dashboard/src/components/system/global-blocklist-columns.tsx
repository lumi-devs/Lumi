import { useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import type { dataTableFeatures } from "#/components/ui/data-table";
import { unblockUserGlobally } from "#/actions/blocklist-actions";
import { Button } from "#/components/ui/button";
import { ConfirmDialog } from "#/components/ui/confirm-dialog";
import type { BlocklistEntryView } from "#/lib/dashboard-data";
import { formatStamp } from "#/lib/log-format";
import { useServerAction } from "#/lib/use-server-action";

// Each row owns its own confirm-dialog state rather than sharing one dialog
// with the table, because unblocking one user has no bearing on any other
// row — there is nothing to coordinate.
function UnblockCell({
  entry,
  onUnblocked,
}: {
  entry: BlocklistEntryView;
  onUnblocked: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const { isPending, error, setError, run } = useServerAction();

  function confirm() {
    run(async () => {
      const result = await unblockUserGlobally(entry.userId);
      if (!result.ok) {
        setError(
          result.error ??
            "The bot didn't lift the block. Check that it is online, then try again.",
        );
        return;
      }
      setOpen(false);
      onUnblocked(
        `Unblocked ${entry.userId}. Lumi answers them again in every server.`,
      );
    });
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        aria-label={`Unblock ${entry.userId}`}
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        Unblock
      </Button>

      <ConfirmDialog
        open={open}
        title={`Unblock ${entry.userId}?`}
        description={
          <>
            Lumi starts answering this user again in every server, as soon as
            you confirm. If an individual server has also blocked them, that
            block stays and Lumi keeps ignoring them there.
          </>
        }
        confirmLabel="Unblock user"
        pendingLabel="Unblocking…"
        tone="primary"
        pending={isPending}
        error={error}
        onConfirm={confirm}
        onClose={() => {
          if (isPending) return;
          setOpen(false);
          setError(null);
        }}
      />
    </>
  );
}

export function globalBlocklistColumns({
  onUnblocked,
}: {
  onUnblocked: (message: string) => void;
}): ColumnDef<typeof dataTableFeatures, BlocklistEntryView>[] {
  return [
    {
      id: "userId",
      header: "User ID",
      accessorFn: (entry) => entry.userId,
      meta: { className: "w-52 tabular font-mono text-[14px] text-fg" },
    },
    {
      id: "reason",
      header: "Reason",
      accessorFn: (entry) => entry.reason ?? "",
      meta: { className: "max-w-[26rem] text-fg-muted" },
      cell: ({ row }) =>
        row.original.reason ? (
          <span className="block truncate" title={row.original.reason}>
            {row.original.reason}
          </span>
        ) : (
          <span className="text-fg-subtle italic">No reason recorded</span>
        ),
    },
    {
      id: "blockedBy",
      header: "Blocked by",
      accessorFn: (entry) => entry.blockedBy,
      meta: { className: "w-44 tabular font-mono text-[14px] text-fg-subtle" },
    },
    {
      id: "createdAt",
      header: "Blocked since",
      accessorFn: (entry) => entry.createdAt,
      meta: { className: "w-44 tabular text-[14px] whitespace-nowrap text-fg-muted" },
      cell: ({ row }) => formatStamp(row.original.createdAt),
    },
    {
      id: "actions",
      header: () => <span className="sr-only">Row actions</span>,
      meta: { className: "w-28 text-right" },
      cell: ({ row }) => <UnblockCell entry={row.original} onUnblocked={onUnblocked} />,
    },
  ];
}
