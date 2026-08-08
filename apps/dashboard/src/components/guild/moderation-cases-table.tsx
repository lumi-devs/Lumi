"use client";

import { useState } from "react";
import { revokeCase } from "#/actions/moderation-actions";
import { Alert } from "#/components/ui/alert";
import { ConfirmDialog } from "#/components/ui/confirm-dialog";
import { DataTable } from "#/components/ui/data-table";
import { moderationCasesColumns } from "#/components/guild/moderation-cases-columns";
import type { ModerationCaseView } from "#/lib/dashboard-data";
import {
  caseActionLabel,
  formatCaseDate,
  isAutoLiftedAction,
  isRestrictingAction,
} from "#/lib/moderation-cases";
import { useServerAction } from "#/lib/use-server-action";

// Revoking writes `active: false` and nothing else: the Discord-side
// ban/mute/quarantine survives, the warn counter is untouched, and the
// scheduled lift task skips inactive cases so any pending auto-unban is
// cancelled. The confirmation copy states all three.
export function ModerationCasesTable({
  guildId,
  cases,
  memberNames,
}: {
  guildId: string;
  cases: ModerationCaseView[];
  memberNames: Record<string, string>;
}) {
  const [target, setTarget] = useState<ModerationCaseView | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { isPending, error, setError, run } = useServerAction();

  const columns = moderationCasesColumns({
    memberNames,
    onRevoke: (c) => {
      setError(null);
      setNotice(null);
      setTarget(c);
    },
  });

  function confirm() {
    if (!target) return;
    const { caseNumber } = target;
    run(async () => {
      const result = await revokeCase(guildId, caseNumber);
      if (!result.ok) {
        setError(result.error ?? "Revoking the case failed. Try again.");
        return;
      }
      setNotice(
        `Case #${caseNumber} revoked. The action in Discord is unchanged.`,
      );
      setTarget(null);
    });
  }

  function close() {
    if (isPending) return;
    setTarget(null);
    setError(null);
  }

  return (
    <>
      <div aria-live="polite">
        {notice ? (
          <Alert variant="info" className="mx-4 mt-3">
            {notice}
          </Alert>
        ) : null}
      </div>

      <DataTable columns={columns} data={cases} getRowId={(c) => String(c.id)} />

      <ConfirmDialog
        open={target !== null}
        title={target ? `Revoke case #${target.caseNumber}?` : "Revoke case"}
        description={target ? <RevokeExplanation moderationCase={target} /> : null}
        confirmLabel="Revoke case"
        pendingLabel="Revoking…"
        pending={isPending}
        error={error}
        onConfirm={confirm}
        onClose={close}
      >
        {target && isAutoLiftedAction(target.action) && target.expiresAt ? (
          <Alert variant="warning" className="mt-1">
            This case was due to lift automatically on{" "}
            <span className="tabular">{formatCaseDate(target.expiresAt)}</span>.
            Revoking it cancels that, so the{" "}
            {caseActionLabel(target.action).toLowerCase()} stays until someone
            removes it in Discord.
          </Alert>
        ) : null}
      </ConfirmDialog>
    </>
  );
}

function RevokeExplanation({
  moderationCase: c,
}: {
  moderationCase: ModerationCaseView;
}) {
  return (
    <>
      Revoking marks case #{c.caseNumber} inactive in Lumi&rsquo;s case history.{" "}
      {isRestrictingAction(c.action)
        ? `It does not undo the ${caseActionLabel(c.action).toLowerCase()} in Discord — lift that in Discord or with Lumi's mod commands.`
        : "Nothing changes in Discord."}
      {c.action === "warn"
        ? " The member's warn count stays as it is, so warn thresholds still count this warn."
        : ""}
    </>
  );
}
