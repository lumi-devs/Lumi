"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { setPanicMode } from "#/actions/security-actions";
import { ActionError } from "#/components/action-error";
import { Alert } from "#/components/ui/alert";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "#/components/ui/card";
import { Checkbox } from "#/components/ui/switch";
import { ConfirmDialog } from "#/components/ui/confirm-dialog";
import { Readout, ReadoutList } from "#/components/ui/readout";
import type { DashboardChannelView, PanicStateView } from "#/lib/dashboard-data";
import { formatCaseDate } from "#/lib/moderation-cases";
import { useServerAction } from "#/lib/use-server-action";

/** `SecurityService.enterPanic` stops after this many channels. */
const CHANNEL_CAP = 40;

export function PanicModeConsole({
  guildId,
  state,
  channels,
  actorName,
}: {
  guildId: string;
  state: PanicStateView;
  channels: DashboardChannelView[];
  actorName?: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const { isPending, error, setError, run } = useServerAction();
  const reduceMotion = useReducedMotion();

  const scoped = picked.length > 0;
  const targetCount = Math.min(scoped ? picked.length : channels.length, CHANNEL_CAP);

  function toggle(channelId: string) {
    setPicked((prev) =>
      prev.includes(channelId)
        ? prev.filter((id) => id !== channelId)
        : [...prev, channelId],
    );
  }

  function confirm() {
    run(async () => {
      const result = state.active
        ? await setPanicMode(guildId, false)
        : await setPanicMode(guildId, true, scoped ? picked : undefined);
      if (!result.ok) {
        setError(
          result.error ??
            "The bot didn't answer in time. Check the guild in Discord before trying again — panic mode may be half applied.",
        );
        return;
      }
      setConfirming(false);
      setPicked([]);
    });
  }

  if (state.active) {
    return (
      <>
        <div className="relative isolate">
          {reduceMotion ? null : (
            <motion.div
              aria-hidden
              className="pointer-events-none absolute -inset-1 -z-10 rounded-panel bg-danger/25 blur-md"
              animate={{ opacity: [0.6, 1, 0.6] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: "easeOut" }}
            />
          )}
        <Card className="border-danger/40">
          <CardHeader
            className="border-danger/25 bg-danger-soft"
            actions={
              <Button
                variant="primary"
                onClick={() => {
                  setError(null);
                  setConfirming(true);
                }}
              >
                Turn off panic mode
              </Button>
            }
          >
            <CardTitle className="flex items-center gap-2 text-danger">
              <Badge variant="danger" dot>
                Locked down
              </Badge>
              Panic mode is on
            </CardTitle>
          </CardHeader>

          <ReadoutList>
            <Readout label="Since">
              <span className="tabular">
                {state.startedAt ? formatCaseDate(state.startedAt) : "Unknown"}
              </span>
            </Readout>
            <Readout label="Started by">
              {actorName ? (
                <>
                  {actorName}{" "}
                  <span className="tabular font-mono text-[13px] text-fg-subtle">
                    {state.actorId}
                  </span>
                </>
              ) : (
                <span className="tabular font-mono text-[14px]">
                  {state.actorId ?? "Unknown"}
                </span>
              )}
            </Readout>
            <Readout label="Invites">
              {state.invitesPaused
                ? "Paused — nobody new can join with an invite link"
                : "Still open — Lumi couldn't pause them, check its Manage Server permission"}
            </Readout>
            <Readout label="Channels locked">
              <span className="tabular">{state.lockedChannelIds.length}</span>
              {state.lockedChannelIds.length > 0 ? (
                <span className="mt-1 flex flex-wrap gap-1">
                  {state.lockedChannelIds.map((id) => (
                    <Badge key={id} variant="neutral">
                      #{channelName(channels, id)}
                    </Badge>
                  ))}
                </span>
              ) : null}
            </Readout>
          </ReadoutList>

          <CardBody className="border-t border-border">
            <ActionError error={error} />
          </CardBody>
        </Card>
        </div>

        <ConfirmDialog
          open={confirming}
          tone="primary"
          title="Turn off panic mode?"
          description={
            <>
              Lumi restores the exact @everyone Send Messages overwrite each of
              the {state.lockedChannelIds.length} locked channels had before the
              lockdown, and{" "}
              {state.invitesPaused ? "re-opens invites" : "leaves invites as they are"}
              . Channels a moderator changed by hand since then are overwritten
              with the snapshot.
            </>
          }
          confirmLabel="Turn off panic mode"
          pendingLabel="Restoring…"
          pending={isPending}
          error={error}
          onConfirm={confirm}
          onClose={() => {
            if (isPending) return;
            setConfirming(false);
            setError(null);
          }}
        />
      </>
    );
  }

  return (
    <>
      <Card>
        <CardHeader
          actions={
            <Button
              variant="danger"
              onClick={() => {
                setError(null);
                setConfirming(true);
              }}
            >
              Turn on panic mode
            </Button>
          }
        >
          <CardTitle>Panic mode is off</CardTitle>
        </CardHeader>

        <CardBody className="flex flex-col gap-3">
          <p className="text-[15px] leading-5 text-fg-muted">
            Turning it on pauses invites for the whole server and denies
            @everyone Send Messages in the channels below, snapshotting each
            channel&rsquo;s current overwrite first so turning it off restores
            them exactly. Edits are paced to stay inside Discord&rsquo;s rate
            limits, so a large server takes a minute or two.
          </p>
          <p className="text-[15px] leading-5 text-fg-muted">
            It doesn&rsquo;t ban, kick or quarantine anyone — it buys time.
          </p>

          <ChannelScope
            channels={channels}
            picked={picked}
            onToggle={toggle}
            onClear={() => setPicked([])}
          />

          <ActionError error={error} />
        </CardBody>
      </Card>

      <ConfirmDialog
        open={confirming}
        title="Lock the server down?"
        description={
          <>
            Lumi pauses invites and denies @everyone Send Messages in{" "}
            <span className="tabular">{targetCount}</span>{" "}
            {scoped ? "selected" : "text and announcement"} channel
            {targetCount === 1 ? "" : "s"}. Members already in the server stay,
            and nothing is deleted.
          </>
        }
        confirmLabel="Turn on panic mode"
        pendingLabel="Locking channels…"
        pending={isPending}
        error={error}
        onConfirm={confirm}
        onClose={() => {
          if (isPending) return;
          setConfirming(false);
          setError(null);
        }}
      >
        <Alert variant="warning" className="mt-1">
          The lock runs one channel at a time and can take a couple of minutes.
          Leave this page open until it finishes, or the run may stop part-way
          through with the server half locked.
        </Alert>
      </ConfirmDialog>
    </>
  );
}

function ChannelScope({
  channels,
  picked,
  onToggle,
  onClear,
}: {
  channels: DashboardChannelView[];
  picked: string[];
  onToggle: (channelId: string) => void;
  onClear: () => void;
}) {
  if (channels.length === 0) {
    return (
      <Alert variant="warning">
        Lumi can&rsquo;t see any text channels in this server, so a lockdown
        would only pause invites. Check that the bot can view the channels you
        want protected.
      </Alert>
    );
  }

  return (
    <div className="rounded-panel border border-border">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-bg-subtle px-3 py-2">
        <p className="font-display text-[13px] tracking-[0.09em] text-fg-subtle uppercase">
          Channels to lock
        </p>
        <p className="text-[14px] text-fg-muted">
          {picked.length === 0
            ? `Every text channel (${Math.min(channels.length, CHANNEL_CAP)} of ${channels.length})`
            : `${picked.length} selected`}
          {picked.length > 0 ? (
            <button
              type="button"
              onClick={onClear}
              className="ml-2 cursor-pointer text-accent-fg underline-offset-4 hover:underline"
            >
              Use every channel
            </button>
          ) : null}
        </p>
      </div>
      <div className="max-h-56 overflow-y-auto p-2">
        <ul className="flex flex-col">
          {channels.map((channel) => (
            <li key={channel.id}>
              <label className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-[15px] text-fg hover:bg-surface-hover">
                <Checkbox
                  checked={picked.includes(channel.id)}
                  onChange={() => onToggle(channel.id)}
                  aria-label={`Lock #${channel.name}`}
                />
                <span className="truncate">#{channel.name}</span>
              </label>
            </li>
          ))}
        </ul>
      </div>
      {channels.length > CHANNEL_CAP && picked.length === 0 ? (
        <p className="border-t border-border px-3 py-2 text-[13px] leading-4 text-fg-subtle">
          Lumi locks at most {CHANNEL_CAP} channels in one run. Pick the
          channels that matter if this server has more.
        </p>
      ) : null}
    </div>
  );
}

function channelName(channels: DashboardChannelView[], id: string): string {
  return channels.find((c) => c.id === id)?.name ?? id;
}
