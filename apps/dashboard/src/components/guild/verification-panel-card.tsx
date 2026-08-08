"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";
import {
  deleteVerificationPanel,
  setVerificationPanel,
} from "#/actions/security-actions";
import { ActionError } from "#/components/action-error";
import { Alert } from "#/components/ui/alert";
import { Button } from "#/components/ui/button";
import { buttonVariants } from "#/components/ui/button-variants";
import {
  Card,
  CardBody,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#/components/ui/card";
import { ConfirmDialog } from "#/components/ui/confirm-dialog";
import { Field, Input, Select } from "#/components/ui/input";
import { Readout, ReadoutList } from "#/components/ui/readout";
import type {
  DashboardChannelView,
  VerificationPanelView,
} from "#/lib/dashboard-data";
import { formatCaseDate, isSnowflake } from "#/lib/moderation-cases";
import { useServerAction } from "#/lib/use-server-action";

// Bookkeeping only: the Verify button is matched by custom ID, so a panel works
// whether or not it is recorded here, and nothing here touches a Discord message.
export function VerificationPanelCard({
  guildId,
  panel,
  channels,
}: {
  guildId: string;
  panel: VerificationPanelView | null;
  channels: DashboardChannelView[];
}) {
  const [editing, setEditing] = useState(false);
  const [forgetting, setForgetting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const { isPending, error, setError, run } = useServerAction();

  function forget() {
    run(async () => {
      const result = await deleteVerificationPanel(guildId);
      if (!result.ok) {
        setError(result.error ?? "Removing the record failed. Try again.");
        return;
      }
      setNotice("Record removed. The panel message is still in Discord.");
      setForgetting(false);
    });
  }

  return (
    <Card>
      <CardHeader
        actions={
          panel && !editing ? (
            <>
              <a
                href={`https://discord.com/channels/${guildId}/${panel.channelId}/${panel.messageId}`}
                target="_blank"
                rel="noreferrer"
                className={buttonVariants({ variant: "secondary", size: "sm" })}
              >
                Open message
                <ExternalLink aria-hidden />
              </a>
              <Button size="sm" onClick={() => setEditing(true)}>
                Point elsewhere
              </Button>
            </>
          ) : null
        }
      >
        <CardTitle>Verification panel</CardTitle>
        <CardDescription>
          Where <code className="font-mono">/verifypanel</code> last posted the
          panel members click to get verified. Changing it here only updates
          Lumi&rsquo;s note of the location — it never posts, moves or deletes a
          message.
        </CardDescription>
      </CardHeader>

      <div aria-live="polite">
        {notice ? (
          <Alert variant="info" className="mx-4 mt-3">
            {notice}
          </Alert>
        ) : null}
      </div>

      {panel && !editing ? (
        <>
          <ReadoutList>
            <Readout label="Channel">
              #{channels.find((c) => c.id === panel.channelId)?.name ?? "unknown"}{" "}
              <span className="tabular font-mono text-[11px] text-fg-subtle">
                {panel.channelId}
              </span>
            </Readout>
            <Readout label="Message">
              <span className="tabular font-mono text-[12px]">
                {panel.messageId}
              </span>
            </Readout>
            <Readout label="Recorded">
              <span className="tabular">{formatCaseDate(panel.createdAt)}</span>
            </Readout>
          </ReadoutList>
          <CardBody className="flex items-center justify-between gap-3 border-t border-border">
            <p className="text-[12px] leading-5 text-fg-muted">
              Deleted the message in Discord? Remove the record so it stops
              pointing at nothing.
            </p>
            <Button
              variant="dangerGhost"
              size="sm"
              onClick={() => {
                setError(null);
                setNotice(null);
                setForgetting(true);
              }}
            >
              Remove record
            </Button>
          </CardBody>
        </>
      ) : (
        <PanelForm
          guildId={guildId}
          channels={channels}
          panel={panel}
          onSaved={(message) => {
            setNotice(message);
            setEditing(false);
          }}
          onCancel={panel ? () => setEditing(false) : undefined}
        />
      )}

      <ConfirmDialog
        open={forgetting}
        title="Remove the panel record?"
        description="Lumi forgets where the panel is. The message stays in Discord and its Verify button keeps working — you just lose the link from this screen."
        confirmLabel="Remove record"
        pendingLabel="Removing…"
        pending={isPending}
        error={error}
        onConfirm={forget}
        onClose={() => {
          if (isPending) return;
          setForgetting(false);
          setError(null);
        }}
      />
    </Card>
  );
}

function PanelForm({
  guildId,
  channels,
  panel,
  onSaved,
  onCancel,
}: {
  guildId: string;
  channels: DashboardChannelView[];
  panel: VerificationPanelView | null;
  onSaved: (message: string) => void;
  onCancel?: () => void;
}) {
  const [channelId, setChannelId] = useState(
    panel?.channelId ?? channels[0]?.id ?? "",
  );
  const [messageId, setMessageId] = useState(panel?.messageId ?? "");
  const { isPending, error, setError, run } = useServerAction();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!channelId) {
      setError("Pick the channel the panel was posted in.");
      return;
    }
    if (!isSnowflake(messageId.trim())) {
      setError(
        "That isn't a message ID. Right-click the panel message in Discord with Developer Mode on and choose Copy Message ID.",
      );
      return;
    }
    run(async () => {
      const result = await setVerificationPanel(
        guildId,
        channelId,
        messageId.trim(),
      );
      if (!result.ok) {
        setError(result.error ?? "Saving the record failed. Try again.");
        return;
      }
      onSaved("Panel location saved.");
    });
  }

  if (channels.length === 0) {
    return (
      <CardBody>
        <Alert variant="warning">
          Lumi can&rsquo;t see any text channels in this server, so there&rsquo;s
          nowhere to record a panel. Check the bot&rsquo;s channel permissions.
        </Alert>
      </CardBody>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field
          label="Channel"
          htmlFor="panel-channel"
          className="min-w-[12rem] flex-1 gap-1"
        >
          <Select
            id="panel-channel"
            value={channelId}
            onChange={(e) => setChannelId(e.target.value)}
          >
            {channels.map((channel) => (
              <option key={channel.id} value={channel.id}>
                #{channel.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Message ID"
          htmlFor="panel-message"
          className="min-w-[12rem] flex-1 gap-1"
          hint="Copy Message ID on the panel message"
        >
          <Input
            id="panel-message"
            value={messageId}
            inputMode="numeric"
            placeholder="e.g. 328473289473289473"
            onChange={(e) => setMessageId(e.target.value)}
          />
        </Field>
        <div className="flex items-center gap-2 pb-px">
          <Button type="submit" variant="primary" disabled={isPending}>
            {isPending ? "Saving…" : "Save location"}
          </Button>
          {onCancel ? (
            <Button type="button" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          ) : null}
        </div>
      </div>
      <ActionError error={error} />
    </form>
  );
}
