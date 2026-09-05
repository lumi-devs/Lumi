"use client";

import { useCallback, useMemo, useState } from "react";
import type { AppealReviewStatus } from "@lumi/contracts";
import { reviewAppeal } from "#/actions/appeals-actions";
import { Alert } from "#/components/ui/alert";
import { ConfirmDialog } from "#/components/ui/confirm-dialog";
import { DataTable } from "#/components/ui/data-table";
import { guildAppealsColumns } from "#/components/guild/guild-appeals-columns";
import type { AppealView } from "#/lib/dashboard-data";
import { AppealStatusLabels } from "#/lib/appeals";
import { useServerAction } from "#/lib/use-server-action";

const ReviewCopy: Record<AppealReviewStatus, { title: string; description: string; tone: "danger" | "primary" }> = {
  approved: {
    title: "Approve this appeal?",
    description:
      "Marks the appeal approved. This does not automatically undo the ban or timeout in Discord — lift that separately if that's the intent.",
    tone: "primary",
  },
  dismissed: {
    title: "Dismiss this appeal?",
    description:
      "Marks the appeal dismissed with no further action. The member can be told to resubmit if there's more to consider.",
    tone: "primary",
  },
  denied: {
    title: "Deny this appeal?",
    description: "Marks the appeal denied. The original case is unaffected.",
    tone: "danger",
  },
  denied_blacklisted: {
    title: "Deny and blacklist this member?",
    description:
      "Marks the appeal denied and adds the member to this server's blocklist, preventing them from rejoining or being re-added by other Lumi actions.",
    tone: "danger",
  },
};

export function GuildAppealsTable({
  guildId,
  appeals,
  memberNames,
}: {
  guildId: string;
  appeals: AppealView[];
  memberNames: Record<string, string>;
}) {
  const [target, setTarget] = useState<{ appeal: AppealView; status: AppealReviewStatus } | null>(
    null,
  );
  const [notice, setNotice] = useState<string | null>(null);
  const { isPending, error, setError, run } = useServerAction();

  const onReview = useCallback(
    (appeal: AppealView, status: AppealReviewStatus) => {
      setError(null);
      setNotice(null);
      setTarget({ appeal, status });
    },
    [setError],
  );

  const columns = useMemo(
    () => guildAppealsColumns({ memberNames, onReview }),
    [memberNames, onReview],
  );

  function confirm() {
    if (!target) return;
    const { appeal, status } = target;
    run(async () => {
      const result = await reviewAppeal(guildId, appeal.id, status);
      if (!result.ok) {
        setError(result.error ?? "Reviewing the appeal failed. Try again.");
        return;
      }
      setNotice(`Appeal for case #${appeal.caseNumber} marked ${AppealStatusLabels[status].toLowerCase()}.`);
      setTarget(null);
    });
  }

  function close() {
    if (isPending) return;
    setTarget(null);
    setError(null);
  }

  const copy = target ? ReviewCopy[target.status] : null;

  return (
    <>
      <div aria-live="polite">
        {notice ? (
          <Alert variant="info" className="mx-4 mt-3">
            {notice}
          </Alert>
        ) : null}
      </div>

      <DataTable columns={columns} data={appeals} getRowId={(a) => String(a.id)} />

      <ConfirmDialog
        open={target !== null}
        title={copy?.title ?? "Review appeal"}
        description={copy?.description ?? null}
        confirmLabel={copy ? copy.title.replace(/\?$/, "") : "Confirm"}
        pendingLabel="Saving…"
        tone={copy?.tone ?? "primary"}
        pending={isPending}
        error={error}
        onConfirm={confirm}
        onClose={close}
      />
    </>
  );
}
