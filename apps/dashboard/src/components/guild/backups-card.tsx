"use client";

import { useState } from "react";
import { restoreGuildBackup } from "#/actions/security-actions";
import { ActionError } from "#/components/action-error";
import { Button } from "#/components/ui/button";
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import { ConfirmDialog } from "#/components/ui/confirm-dialog";
import { EmptyState } from "#/components/ui/empty-state";
import { Archive } from "lucide-react";
import { formatCaseDate } from "#/lib/moderation-cases";
import { useServerAction } from "#/lib/use-server-action";
import type { GuildBackupView } from "@lumi/contracts";

export function BackupsCard({
  guildId,
  backups,
}: {
  guildId: string;
  backups: GuildBackupView[];
}) {
  const [restoring, setRestoring] = useState(false);
  const { isPending, error, setError, run } = useServerAction();
  const latest = backups[0] ?? null;

  function restore() {
    run(async () => {
      const res = await restoreGuildBackup(guildId, latest?.id);
      if (!res.ok) {
        setError(res.error ?? "Restore failed");
        return;
      }
      setRestoring(false);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Backups</CardTitle>
        <CardDescription>
          A structural snapshot (roles and channels, not messages) is taken
          automatically. Restore recreates anything missing from the latest one.
        </CardDescription>
      </CardHeader>

      {latest === null ? (
        <EmptyState
          compact
          icon={Archive}
          title="No backups yet"
          description="A snapshot is taken automatically once the security module has been active for a while."
        />
      ) : (
        <CardBody className="flex items-center justify-between gap-3 border-t border-border">
          <div className="text-[14px] leading-5 text-fg-muted">
            <p className="font-medium text-fg">
              Last snapshot: <span className="tabular">{formatCaseDate(latest.createdAt)}</span>
            </p>
            <p className="tabular font-mono text-[13px] text-fg-subtle">
              {latest.roleCount} roles · {latest.channelCount} channels
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setError(null);
              setRestoring(true);
            }}
          >
            Restore
          </Button>
        </CardBody>
      )}

      <ActionError error={error} />

      <ConfirmDialog
        open={restoring}
        title="Restore from the latest backup?"
        description="Recreates any role or channel from the snapshot that's missing now. Nothing extra is deleted."
        confirmLabel="Restore"
        pendingLabel="Restoring…"
        pending={isPending}
        error={error}
        onConfirm={restore}
        onClose={() => {
          if (isPending) return;
          setRestoring(false);
          setError(null);
        }}
      />
    </Card>
  );
}
