"use client";

import { useState } from "react";
import { UserX } from "lucide-react";
import {
  blockUserInGuild,
  unblockUserInGuild,
} from "#/actions/blocklist-actions";
import { ActionError } from "#/components/action-error";
import { Alert } from "#/components/ui/alert";
import { Button } from "#/components/ui/button";
import { ConfirmDialog } from "#/components/ui/confirm-dialog";
import { DataTable } from "#/components/ui/data-table";
import { EmptyState } from "#/components/ui/empty-state";
import { Field, Input } from "#/components/ui/input";
import { guildBlocklistColumns } from "#/components/guild/guild-blocklist-columns";
import type { BlocklistEntryView } from "#/lib/dashboard-data";
import { isSnowflake } from "#/lib/moderation-cases";
import { useServerAction } from "#/lib/use-server-action";

export function GuildBlocklistTable({
  guildId,
  entries,
  memberNames,
  pastEnd,
}: {
  guildId: string;
  entries: BlocklistEntryView[];
  memberNames: Record<string, string>;
  pastEnd?: React.ReactNode;
}) {
  const [target, setTarget] = useState<BlocklistEntryView | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { isPending, error, setError, run } = useServerAction();

  const columns = guildBlocklistColumns({
    memberNames,
    onUnblock: (entry) => {
      setError(null);
      setNotice(null);
      setTarget(entry);
    },
  });

  function confirmUnblock() {
    if (!target) return;
    const { userId } = target;
    run(async () => {
      const result = await unblockUserInGuild(guildId, userId);
      if (!result.ok) {
        setError(result.error ?? "Unblocking failed. Try again in a moment.");
        return;
      }
      setNotice(`${nameFor(memberNames, userId)} can use Lumi here again.`);
      setTarget(null);
    });
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

      {pastEnd ??
        (entries.length === 0 ? (
          <EmptyState
            icon={UserX}
            title="Nobody is blocked here"
            description="Blocking stops someone using Lumi's commands in this server — every command they run is refused. It changes nothing about their Discord permissions, so use a mute or ban for behaviour in chat."
          />
        ) : (
          <DataTable
            columns={columns}
            data={entries}
            getRowId={(entry) => String(entry.id)}
          />
        ))}

      <BlockForm
        guildId={guildId}
        onBlocked={(message) => {
          setNotice(message);
        }}
      />

      <ConfirmDialog
        open={target !== null}
        title="Unblock this user?"
        description={
          target ? (
            <>
              {nameFor(memberNames, target.userId)} can run Lumi&rsquo;s commands
              in this server again straight away. If they&rsquo;re also on the
              bot-wide blocklist, that one still applies.
            </>
          ) : null
        }
        confirmLabel="Unblock user"
        pendingLabel="Unblocking…"
        pending={isPending}
        error={error}
        onConfirm={confirmUnblock}
        onClose={() => {
          if (isPending) return;
          setTarget(null);
          setError(null);
        }}
      />
    </>
  );
}

function BlockForm({
  guildId,
  onBlocked,
}: {
  guildId: string;
  onBlocked: (message: string) => void;
}) {
  const [userId, setUserId] = useState("");
  const [reason, setReason] = useState("");
  const { isPending, error, setError, run } = useServerAction();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = userId.trim();
    if (!isSnowflake(trimmed)) {
      setError(
        "That isn't a Discord user ID. Turn on Developer Mode in Discord, right-click the member and choose Copy User ID.",
      );
      return;
    }
    run(async () => {
      const result = await blockUserInGuild(
        guildId,
        trimmed,
        reason.trim() || undefined,
      );
      if (!result.ok) {
        setError(result.error ?? "Blocking failed. Try again in a moment.");
        return;
      }
      onBlocked(`${trimmed} can no longer use Lumi in this server.`);
      setUserId("");
      setReason("");
    });
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-3 border-t border-border bg-bg-subtle px-4 py-3"
    >
      <div className="flex flex-wrap items-end gap-3">
        <Field
          label="User ID"
          htmlFor="block-user"
          className="min-w-[13rem] flex-1 gap-1"
        >
          <Input
            id="block-user"
            value={userId}
            inputMode="numeric"
            placeholder="e.g. 328473289473289473"
            onChange={(e) => setUserId(e.target.value)}
          />
        </Field>
        <Field
          label="Reason"
          htmlFor="block-reason"
          className="min-w-[13rem] flex-[2] gap-1"
        >
          <Input
            id="block-reason"
            value={reason}
            maxLength={500}
            placeholder="e.g. spamming /play in every channel"
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
        <div className="flex flex-col gap-1">
          {/* Invisible spacer matching Field's Label row, so the button - which
           * has no label of its own - still bottom-aligns with the inputs. */}
          <span aria-hidden className="invisible text-[14px] leading-4">
            spacer
          </span>
          <Button type="submit" variant="primary" disabled={isPending}>
            {isPending ? "Blocking…" : "Block user"}
          </Button>
        </div>
      </div>
      <p className="text-[13px] leading-4 text-fg-subtle">
        Reason is optional, shown to whoever reads this list later.
      </p>
      <ActionError error={error} />
    </form>
  );
}

function nameFor(names: Record<string, string>, id: string): string {
  return names[id] ?? id;
}
