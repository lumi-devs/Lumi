"use client";

import { useState } from "react";
import { ExternalLink, Inbox } from "lucide-react";
import { confirmLogClaim, dismissLogClaim } from "#/actions/log-claims-actions";
import { ActionError } from "#/components/action-error";
import { Alert } from "#/components/ui/alert";
import { Button } from "#/components/ui/button";
import { buttonVariants } from "#/components/ui/button-variants";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#/components/ui/card";
import { ConfirmDialog } from "#/components/ui/confirm-dialog";
import { Field, Select } from "#/components/ui/input";
import { EmptyState } from "#/components/ui/empty-state";
import { spotlightHandler } from "#/lib/animate";
import type {
  DashboardChannelView,
  DashboardMemberView,
  LogClaimView,
  LogTypeOption,
} from "#/lib/dashboard-data";
import { formatCaseDate } from "#/lib/moderation-cases";
import { useServerAction } from "#/lib/use-server-action";

const ChannelTypeLabels: Record<number, string> = {
  0: "Text",
  2: "Voice",
  4: "Category",
  5: "Announcement",
  10: "Thread",
  11: "Thread",
  12: "Thread",
  13: "Stage",
  15: "Forum",
  16: "Media",
};

function channelTypeLabel(type: number): string {
  return ChannelTypeLabels[type] ?? `Type ${type}`;
}

export function LogClaimsCard({
  guildId,
  claims,
  channels,
  members,
  logTypes,
}: {
  guildId: string;
  claims: LogClaimView[];
  channels: DashboardChannelView[];
  members: DashboardMemberView[];
  logTypes: LogTypeOption[];
}) {
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [dismissing, setDismissing] = useState<LogClaimView | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { isPending, error, setError, run } = useServerAction();

  function logTypeFor(channelId: string): string {
    return selections[channelId] ?? logTypes[0]?.key ?? "";
  }

  function confirm(claim: LogClaimView) {
    const logTypeKey = logTypeFor(claim.channelId);
    if (!logTypeKey) {
      setError("Pick which log type this channel should receive.");
      return;
    }
    run(async () => {
      const result = await confirmLogClaim(
        guildId,
        claim.channelId,
        logTypeKey,
      );
      if (!result.ok) {
        setError(result.error ?? "Saving the log destination failed. Try again.");
        return;
      }
      const label = logTypes.find((t) => t.key === logTypeKey)?.label ?? logTypeKey;
      const name = channels.find((c) => c.id === claim.channelId)?.name ?? claim.channelId;
      setNotice(`#${name} now receives ${label}.`);
    });
  }

  function dismiss() {
    if (!dismissing) return;
    const claim = dismissing;
    run(async () => {
      const result = await dismissLogClaim(guildId, claim.channelId);
      if (!result.ok) {
        setError(result.error ?? "Dismissing the claim failed. Try again.");
        return;
      }
      setDismissing(null);
      setNotice("Claim dismissed. The channel is unchanged.");
    });
  }

  return (
    <Card className="spotlight" onMouseMove={spotlightHandler}>
      <CardHeader>
        <CardTitle>Pending log channel claims</CardTitle>
        <CardDescription>
          Channels claimed in Discord with{" "}
          <code className="font-mono">/log claim</code>. Confirm one to point
          a log type at it, or dismiss it to leave the configuration alone.
        </CardDescription>
      </CardHeader>

      <div aria-live="polite">
        {notice ? (
          <Alert variant="info" className="mx-4 mt-3">
            {notice}
          </Alert>
        ) : null}
      </div>

      {claims.length === 0 ? (
        <EmptyState
          compact
          icon={Inbox}
          title="No pending claims"
          description="Run /log claim in Discord, then post the code in the channel that should receive logs. It appears here for review."
        />
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {claims.map((claim) => {
            const channel = channels.find((c) => c.id === claim.channelId);
            const author = members.find((m) => m.id === claim.authorId);
            return (
              <li
                key={claim.channelId}
                className="flex flex-wrap items-end gap-3 p-4"
              >
                <div className="min-w-[12rem] flex-1">
                  <p className="text-[14px] font-semibold">
                    #{channel?.name ?? "unknown channel"}{" "}
                    <span className="font-normal text-fg-subtle">
                      {channel ? channelTypeLabel(channel.type) : ""}
                    </span>
                  </p>
                  <p className="text-[13px] leading-5 text-fg-muted">
                    Claimed by {author?.displayName ?? author?.username ?? claim.authorId} ·{" "}
                    <span className="tabular">{formatCaseDate(claim.claimedAt)}</span>
                  </p>
                  <p className="text-[13px] leading-5">
                    <a
                      href={`https://discord.com/channels/${guildId}/${claim.channelId}/${claim.messageId}`}
                      target="_blank"
                      rel="noreferrer"
                      className={buttonVariants({ variant: "secondary", size: "sm" })}
                    >
                      Open claim message
                      <ExternalLink aria-hidden />
                    </a>
                  </p>
                </div>
                <Field
                  label="Log type"
                  htmlFor={`logtype-${claim.channelId}`}
                  className="min-w-[12rem] flex-1 gap-1"
                >
                  <Select
                    id={`logtype-${claim.channelId}`}
                    value={logTypeFor(claim.channelId)}
                    disabled={isPending || logTypes.length === 0}
                    onChange={(e) =>
                      setSelections((prev) => ({
                        ...prev,
                        [claim.channelId]: e.target.value,
                      }))
                    }
                  >
                    {logTypes.map((option) => (
                      <option key={option.key} value={option.key}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={isPending || logTypes.length === 0}
                    onClick={() => confirm(claim)}
                  >
                    {isPending ? "Saving…" : "Confirm"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={isPending}
                    onClick={() => {
                      setError(null);
                      setNotice(null);
                      setDismissing(claim);
                    }}
                  >
                    Dismiss
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {error ? (
        <div className="px-4 pb-4">
          <ActionError error={error} />
        </div>
      ) : null}

      <ConfirmDialog
        open={dismissing !== null}
        title="Dismiss this claim?"
        description="Lumi forgets the claim. The channel is unchanged and the code is already spent, so claiming again needs a fresh /log claim."
        confirmLabel="Dismiss claim"
        pendingLabel="Dismissing…"
        pending={isPending}
        error={null}
        onConfirm={dismiss}
        onClose={() => {
          if (isPending) return;
          setDismissing(null);
          setError(null);
        }}
      />
    </Card>
  );
}
