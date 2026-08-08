"use client";

import { useState } from "react";
import { Volume2 } from "lucide-react";
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
import { tempvcGeneratorsColumns } from "#/components/guild/tempvc-generators-columns";
import type {
  DashboardChannelView,
  TempVcGeneratorView,
} from "#/lib/dashboard-data";
import { useServerAction } from "#/lib/use-server-action";

/** Mirrors `TempVcService.createVc`: no `{}` in the template appends the number. */
export function resolveName(template: string, number: number): string {
  const trimmed = template.trim();
  return trimmed.includes("{}")
    ? trimmed.replace("{}", String(number))
    : `${trimmed} ${number}`;
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
          label="Name pattern"
          htmlFor="generator-name"
          className="min-w-[12rem] flex-1 gap-1"
          hint={
            name.includes("{}")
              ? `Creates “${resolveName(name, 1)}”`
              : `No {} in the pattern, so the number goes on the end: “${resolveName(name, 1)}”`
          }
        >
          <Input
            id="generator-name"
            value={name}
            maxLength={100}
            placeholder="Gaming {}"
            onChange={(e) => setName(e.target.value)}
          />
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
      <ActionError error={error} />
    </form>
  );
}
