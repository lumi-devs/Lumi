"use client";

import { useState } from "react";
import { EyeOff } from "lucide-react";
import {
  addIgnoredChannel,
  removeIgnoredChannel,
} from "#/actions/advanced-actions";
import { ActionError } from "#/components/action-error";
import { Alert } from "#/components/ui/alert";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { ConfirmDialog } from "#/components/ui/confirm-dialog";
import { EmptyState } from "#/components/ui/empty-state";
import { Field, Select } from "#/components/ui/input";
import type {
  DashboardChannelView,
  IgnoredChannelView,
} from "#/lib/dashboard-data";
import { useServerAction } from "#/lib/use-server-action";

const WHOLE_SERVER = "__server__";

// A `channelId: null` row silences every command in every channel, not one
// more ignored channel — hence its own row treatment and confirmation.
export function IgnoredChannelsList({
  guildId,
  entries,
  channels,
}: {
  guildId: string;
  entries: IgnoredChannelView[];
  channels: DashboardChannelView[];
}) {
  const [picked, setPicked] = useState("");
  const [confirmingServer, setConfirmingServer] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const { isPending, error, setError, run } = useServerAction();

  const ignoredIds = new Set(entries.map((e) => e.channelId));
  const serverIgnored = ignoredIds.has(null);
  const options = channels.filter((c) => !ignoredIds.has(c.id));

  function add(channelId: string | null) {
    run(async () => {
      const result = await addIgnoredChannel(guildId, channelId);
      if (!result.ok) {
        setError(result.error ?? "Adding the rule failed. Try again.");
        return;
      }
      setNotice(
        channelId === null
          ? "Lumi now ignores commands everywhere in this server."
          : `Lumi now ignores commands in #${channels.find((c) => c.id === channelId)?.name ?? channelId}.`,
      );
      setPicked("");
      setConfirmingServer(false);
    });
  }

  function remove(entry: IgnoredChannelView) {
    run(async () => {
      const result = await removeIgnoredChannel(guildId, entry.channelId);
      if (!result.ok) {
        setError(result.error ?? "Removing the rule failed. Try again.");
        return;
      }
      setNotice(
        entry.channelId === null
          ? "Lumi answers commands in this server again."
          : `Lumi answers commands in #${channels.find((c) => c.id === entry.channelId)?.name ?? entry.channelId} again.`,
      );
    });
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    if (!picked) {
      setError("Pick a channel, or choose the whole server.");
      return;
    }
    if (picked === WHOLE_SERVER) {
      setConfirmingServer(true);
      return;
    }
    add(picked);
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

      {entries.length === 0 ? (
        <EmptyState
          compact
          icon={EyeOff}
          title="Lumi answers everywhere"
          description="Ignore a channel to keep command spam out of it — Lumi stops responding there while everything else carries on as normal."
        />
      ) : (
        <ul className="divide-y divide-border">
          {[...entries]
            .sort((a, b) => Number(b.channelId === null) - Number(a.channelId === null))
            .map((entry) => {
              const channel = entry.channelId
                ? channels.find((c) => c.id === entry.channelId)
                : undefined;
              return (
                <li
                  key={entry.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-[13px] text-fg">
                      {entry.channelId === null ? (
                        <>
                          The whole server
                          <Badge variant="danger" dot>
                            All commands off
                          </Badge>
                        </>
                      ) : (
                        `#${channel?.name ?? entry.channelId}`
                      )}
                    </p>
                    <p className="text-[12px] leading-5 text-fg-muted">
                      {entry.channelId === null
                        ? "Every command in every channel is refused with “This server is not using Lumi.”"
                        : channel
                          ? "Commands here are refused; the rest of the server is unaffected."
                          : "That channel no longer exists, so this rule does nothing."}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isPending}
                    onClick={() => {
                      setError(null);
                      setNotice(null);
                      remove(entry);
                    }}
                  >
                    Stop ignoring
                  </Button>
                </li>
              );
            })}
        </ul>
      )}

      <form
        onSubmit={submit}
        className="flex flex-col gap-3 border-t border-border bg-bg-subtle px-4 py-3"
      >
        <div className="flex flex-wrap items-end gap-3">
          <Field
            label="Ignore commands in"
            htmlFor="ignore-channel"
            className="min-w-[14rem] flex-1 gap-1"
          >
            <Select
              id="ignore-channel"
              value={picked}
              onChange={(e) => setPicked(e.target.value)}
            >
              <option value="">Pick a channel…</option>
              {serverIgnored ? null : (
                <option value={WHOLE_SERVER}>The whole server</option>
              )}
              {options.map((channel) => (
                <option key={channel.id} value={channel.id}>
                  #{channel.name}
                </option>
              ))}
            </Select>
          </Field>
          <Button
            type="submit"
            variant="primary"
            disabled={isPending}
            className="mb-px"
          >
            {isPending
              ? "Saving…"
              : picked === WHOLE_SERVER
                ? "Ignore the whole server"
                : "Ignore channel"}
          </Button>
        </div>
        <ActionError error={error} />
      </form>

      <ConfirmDialog
        open={confirmingServer}
        title="Ignore the whole server?"
        description="Lumi stops answering every command in every channel, for everyone including admins. Automatic moderation that doesn't involve a command keeps running. Since commands are off, this dashboard is the only way back."
        confirmLabel="Ignore the whole server"
        pendingLabel="Saving…"
        pending={isPending}
        error={error}
        onConfirm={() => add(null)}
        onClose={() => {
          if (isPending) return;
          setConfirmingServer(false);
          setError(null);
        }}
      />
    </>
  );
}
