"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";
import {
  deleteVerificationPanel,
  postVerificationPanel,
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
import { Field } from "#/components/ui/input";
import { Select } from "#/components/ui/select";
import { Switch } from "#/components/ui/switch";
import { Readout, ReadoutList } from "#/components/ui/readout";
import { spotlightHandler } from "#/lib/animate";
import type {
  DashboardChannelView,
  VerificationPanelView,
} from "#/lib/dashboard-data";
import { formatCaseDate } from "#/lib/moderation-cases";
import { useServerAction } from "#/lib/use-server-action";

const CreateChannelValue = "__create__";

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
    <Card className="spotlight" onMouseMove={spotlightHandler}>
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
                Move it
              </Button>
            </>
          ) : null
        }
      >
        <CardTitle>Verification panel</CardTitle>
        <CardDescription>
          Where Lumi posted the panel members click to get verified. Saving
          below posts a fresh panel if none is tracked yet, edits the existing
          message in place if you keep the same channel, or moves it to a
          different channel when you pick one.
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
              <span className="tabular font-mono text-[13px] text-fg-subtle">
                {panel.channelId}
              </span>
            </Readout>
            <Readout label="Message">
              <span className="tabular font-mono text-[14px]">
                {panel.messageId}
              </span>
            </Readout>
            <Readout label="Recorded">
              <span className="tabular">{formatCaseDate(panel.createdAt)}</span>
            </Readout>
          </ReadoutList>
          <CardBody className="flex items-center justify-between gap-3 border-t border-border">
            <p className="text-[14px] leading-5 text-fg-muted">
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
  const [confirmingMove, setConfirmingMove] = useState(false);
  const [deleteOldMessage, setDeleteOldMessage] = useState(false);
  const { isPending, error, setError, run } = useServerAction();

  const isMove = Boolean(
    panel && (channelId === CreateChannelValue || channelId !== panel.channelId),
  );
  const oldChannelName = panel
    ? channels.find((c) => c.id === panel.channelId)?.name
    : undefined;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!channelId) {
      setError("Pick the channel to post the panel in.");
      return;
    }
    if (isMove) {
      setError(null);
      setConfirmingMove(true);
      return;
    }
    post();
  }

  function post() {
    run(async () => {
      const result = await postVerificationPanel(guildId, {
        channelId: channelId === CreateChannelValue ? undefined : channelId,
        createChannel: channelId === CreateChannelValue,
        deleteOldMessage: isMove ? deleteOldMessage : undefined,
      });
      if (!result.ok) {
        setError(result.error ?? "Posting the panel failed. Try again.");
        return;
      }
      setConfirmingMove(false);
      const channelName =
        channels.find((c) => c.id === result.channelId)?.name ?? "the channel";
      if (result.createdChannel) {
        onSaved(`Created #${channelName} and posted the panel there.`);
      } else if (result.moved) {
        onSaved(
          result.oldMessageDeleted
            ? `Moved the panel to #${channelName} and deleted the old message.`
            : `Moved the panel to #${channelName}. The old message was left behind.`,
        );
      } else if (result.edited) {
        onSaved(`Updated the panel message in #${channelName}.`);
      } else {
        onSaved(`Posted a new panel in #${channelName}.`);
      }
    });
  }

  if (channels.length === 0) {
    return (
      <CardBody>
        <Alert variant="warning">
          Lumi can&rsquo;t see any text channels in this server, so there&rsquo;s
          nowhere to post a panel. Check the bot&rsquo;s channel permissions, or
          create one below.
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
            aria-label="Channel"
            value={channelId}
            onValueChange={(next) => setChannelId(next)}
            options={[
              ...channels.map((channel) => ({
                value: channel.id,
                label: `#${channel.name}`,
              })),
              { value: CreateChannelValue, label: "+ Create new channel (#verify-here)" },
            ]}
          />
        </Field>
        <div className="flex flex-col gap-1">
          {/* Invisible spacer matching Field's Label row, so this button -
           * which has no label of its own - still bottom-aligns with the
           * input. */}
          <span aria-hidden className="invisible text-[14px] leading-4">
            spacer
          </span>
          <div className="flex items-center gap-2">
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
      </div>
      <p className="text-[13px] leading-4 text-fg-subtle">
        {channelId === CreateChannelValue
          ? "Lumi will create #verify-here and post the panel there."
          : panel && channelId === panel.channelId
            ? "Lumi will edit the existing panel message in place."
            : "Lumi will post a new panel message in this channel."}
      </p>
      <ActionError error={error} />

      <ConfirmDialog
        open={confirmingMove}
        title="Move the verification panel?"
        description={
          <>
            This posts a new panel in{" "}
            {channelId === CreateChannelValue ? (
              <>the new #verify-here channel</>
            ) : (
              <>#{channels.find((c) => c.id === channelId)?.name ?? "the selected channel"}</>
            )}
            {oldChannelName ? (
              <>
                {" "}
                and stops tracking the one in #{oldChannelName}. That old message
                is left exactly as it is — its Verify button keeps working, but
                it&rsquo;s no longer the panel Lumi points members to. Only Lumi&rsquo;s
                own tracked panel message is ever touched — nothing else in the
                channel is affected.
              </>
            ) : null}
          </>
        }
        confirmLabel="Move panel"
        pendingLabel="Moving…"
        pending={isPending}
        error={error}
        onConfirm={post}
        onClose={() => {
          if (isPending) return;
          setConfirmingMove(false);
          setError(null);
        }}
      >
        <label className="flex items-center gap-2 text-[14px] text-fg">
          <Switch
            checked={deleteOldMessage}
            onChange={setDeleteOldMessage}
            aria-label="Also delete the old message"
          />
          Also delete the old message{oldChannelName ? ` in #${oldChannelName}` : ""}
        </label>
      </ConfirmDialog>
    </form>
  );
}
