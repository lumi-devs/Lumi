"use client";

import { useState } from "react";
import { Info, Volume2 } from "lucide-react";
import {
  deleteTempVcGenerator,
  setTempVcGenerator,
} from "#/actions/tempvc-actions";
import { ActionError } from "#/components/action-error";
import { Alert } from "#/components/ui/alert";
import { Button } from "#/components/ui/button";
import { ConfirmDialog } from "#/components/ui/confirm-dialog";
import { DataTable } from "#/components/ui/data-table";
import { EmptyState } from "#/components/ui/empty-state";
import { Field, Input, Select } from "#/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "#/components/ui/tooltip";
import { tempvcGeneratorsColumns } from "#/components/guild/tempvc-generators-columns";
import type {
  DashboardChannelView,
  TempVcGeneratorView,
} from "#/lib/dashboard-data";
import { useServerAction } from "#/lib/use-server-action";

/**
 * Mirrors `TempVcService.resolveGeneratorName`: substitutes `{}`/`{number}`
 * (sequence number), `{position}` (alias of `{number}`), `{username}`, and
 * `{name}` (both shown as "Alex" here since the preview has no real member).
 * No placeholder appends the number to the end.
 */
/** Whether the resolved name actually changes from one generated channel to the next. */
export function hasSequencePlaceholder(template: string): boolean {
  const trimmed = template.trim();
  const hasNamedPlaceholder = /\{number\}|\{position\}|\{username\}|\{name\}/.test(
    trimmed,
  );
  return !hasNamedPlaceholder || /\{\}|\{number\}|\{position\}/.test(trimmed);
}

export function resolveName(template: string, number: number): string {
  const trimmed = template.trim();
  const hasPlaceholder = /\{\}|\{number\}|\{position\}|\{username\}|\{name\}/.test(
    trimmed,
  );
  if (!hasPlaceholder) return `${trimmed} ${number}`;
  return trimmed
    .replaceAll("{}", String(number))
    .replaceAll("{number}", String(number))
    .replaceAll("{position}", String(number))
    .replaceAll("{username}", "Alex")
    .replaceAll("{name}", "Alex");
}

export function TempVcGenerators({
  guildId,
  generators,
  channels,
}: {
  guildId: string;
  generators: TempVcGeneratorView[];
  channels: DashboardChannelView[];
}) {
  const [editing, setEditing] = useState<TempVcGeneratorView | null>(null);
  const [target, setTarget] = useState<TempVcGeneratorView | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { isPending, error, setError, run } = useServerAction();

  const columns = tempvcGeneratorsColumns({
    channels,
    onEdit: (generator) => {
      setError(null);
      setNotice(null);
      setEditing(generator);
    },
    onRemove: (generator) => {
      setError(null);
      setNotice(null);
      setTarget(generator);
    },
  });

  function confirmRemove() {
    if (!target) return;
    const { channelId } = target;
    run(async () => {
      const result = await deleteTempVcGenerator(guildId, channelId);
      if (!result.ok) {
        setError(result.error ?? "Removing the generator failed. Try again.");
        return;
      }
      setNotice(
        "Generator removed. Channels it already created stay until they empty out.",
      );
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

      {generators.length === 0 ? (
        <EmptyState
          icon={Volume2}
          title="No join-to-create channels yet"
          description="Pick an empty voice channel below and Lumi will move anyone who joins it into a fresh channel of their own, created in the same category."
        />
      ) : (
        <DataTable
          columns={columns}
          data={generators}
          getRowId={(generator) => generator.channelId}
        />
      )}

      <GeneratorForm
        key={editing?.channelId ?? "new"}
        guildId={guildId}
        generators={generators}
        channels={channels}
        editing={editing}
        onCancel={() => setEditing(null)}
        onSaved={(message) => {
          setNotice(message);
          setEditing(null);
        }}
      />

      <ConfirmDialog
        open={target !== null}
        title="Remove this generator?"
        description="Joining that channel stops creating anything. Temporary channels it already made keep working and disappear on their own once everyone leaves."
        confirmLabel="Remove generator"
        pendingLabel="Removing…"
        pending={isPending}
        error={error}
        onConfirm={confirmRemove}
        onClose={() => {
          if (isPending) return;
          setTarget(null);
          setError(null);
        }}
      />
    </>
  );
}

function GeneratorForm({
  guildId,
  generators,
  channels,
  editing,
  onSaved,
  onCancel,
}: {
  guildId: string;
  generators: TempVcGeneratorView[];
  channels: DashboardChannelView[];
  editing: TempVcGeneratorView | null;
  onSaved: (message: string) => void;
  onCancel: () => void;
}) {
  const taken = new Set(
    generators
      .map((g) => g.channelId)
      .filter((id) => id !== editing?.channelId),
  );
  const options = channels.filter((c) => !taken.has(c.id));

  const [channelId, setChannelId] = useState(
    editing?.channelId ?? options[0]?.id ?? "",
  );
  const [name, setName] = useState(editing?.name ?? "{}'s channel");
  const [limit, setLimit] = useState(String(editing?.limit ?? 0));
  const { isPending, error, setError, run } = useServerAction();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!channelId) {
      setError("Pick the voice channel members will join.");
      return;
    }
    if (trimmed.length === 0 || trimmed.length > 100) {
      setError("The name pattern has to be between 1 and 100 characters.");
      return;
    }
    const parsedLimit = Number.parseInt(limit, 10);
    if (!Number.isInteger(parsedLimit) || parsedLimit < 0 || parsedLimit > 99) {
      setError("User limit has to be a whole number from 0 to 99.");
      return;
    }
    run(async () => {
      const result = await setTempVcGenerator(
        guildId,
        channelId,
        trimmed,
        parsedLimit,
      );
      if (!result.ok) {
        setError(result.error ?? "Saving the generator failed. Try again.");
        return;
      }
      onSaved(
        editing
          ? "Generator updated. Channels already created keep their old name."
          : "Generator added.",
      );
    });
  }

  if (options.length === 0 && !editing) {
    return (
      <div className="border-t border-border bg-bg-subtle px-4 py-3">
        <Alert variant="info">
          {channels.length === 0
            ? "Lumi can't see any voice channels in this server. Create one, or check the bot's channel permissions."
            : "Every voice channel Lumi can see is already a generator. Remove one to reuse its channel."}
        </Alert>
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-3 border-t border-border bg-bg-subtle px-4 py-3"
    >
      <div className="flex flex-wrap items-end gap-3">
        <Field
          label="Trigger channel"
          htmlFor="generator-channel"
          className="min-w-[11rem] flex-1 gap-1"
        >
          <Select
            id="generator-channel"
            value={channelId}
            disabled={editing !== null}
            onChange={(e) => setChannelId(e.target.value)}
          >
            {editing && !options.some((c) => c.id === editing.channelId) ? (
              <option value={editing.channelId}>{editing.channelId}</option>
            ) : null}
            {options.map((channel) => (
              <option key={channel.id} value={channel.id}>
                {channel.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="User limit"
          htmlFor="generator-limit"
          className="w-28 gap-1"
          hint="0 for no limit"
        >
          <Input
            id="generator-limit"
            value={limit}
            inputMode="numeric"
            onChange={(e) => setLimit(e.target.value)}
          />
        </Field>

        <div className="flex items-center gap-2 pb-px">
          <Button type="submit" variant="primary" disabled={isPending}>
            {isPending
              ? "Saving…"
              : editing
                ? "Save generator"
                : "Add generator"}
          </Button>
          {editing ? (
            <Button type="button" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          ) : null}
        </div>
      </div>

      <Field
        label={
          <span className="inline-flex items-center gap-1">
            Name pattern
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label="Name pattern placeholders"
                    className="inline-flex size-3.5 items-center justify-center rounded-full text-fg-subtle transition-colors hover:text-fg"
                  >
                    <Info className="size-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="w-auto max-w-none px-3 py-2.5">
                  <div className="grid grid-cols-[max-content_1fr] items-baseline gap-x-3 gap-y-1 text-[11px]">
                    {[
                      { tokens: ["{}", "{number}", "{position}"], example: "1" },
                      { tokens: ["{username}", "{name}"], example: "Alex" },
                    ].map(({ tokens, example }) => (
                      <div key={example} className="col-span-2 grid grid-cols-subgrid items-baseline">
                        <span className="flex flex-wrap gap-x-1 font-mono text-background/70">
                          {tokens.map((token, i) => (
                            <span key={token}>
                              {i > 0 ? <span className="text-background/50">/</span> : null}
                              {token}
                            </span>
                          ))}
                        </span>
                        <span className="text-background/70">
                          → <span className="text-background">“{example}”</span>
                        </span>
                      </div>
                    ))}
                    <div className="col-span-2 mt-0.5 border-t border-background/20 pt-1.5 text-background/60">
                      No placeholder → number appended to the end.
                    </div>
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </span>
        }
        htmlFor="generator-name"
        className="gap-1.5"
      >
        <div className="flex flex-wrap items-center gap-2">
          <Input
            id="generator-name"
            value={name}
            maxLength={100}
            placeholder="{name}'s Channel"
            onChange={(e) => setName(e.target.value)}
            className="min-w-[12rem] flex-1"
          />
          <span
            className="inline-flex h-8 min-w-0 items-center gap-1.5 rounded-full border border-border bg-surface px-3 text-[12px] text-fg"
            aria-live="polite"
          >
            <Volume2 aria-hidden className="size-3.5 shrink-0 text-fg-subtle" />
            <span className="truncate">{resolveName(name, 1)}</span>
          </span>
        </div>
      </Field>

      <ActionError error={error} />
    </form>
  );
}
