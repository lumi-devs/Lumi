"use client";

import { useState } from "react";
import { ArrowRight, RotateCcw } from "lucide-react";
import { rollbackConfigChange } from "#/actions/history-actions";
import { Alert } from "#/components/ui/alert";
import { Button } from "#/components/ui/button";
import { ConfirmDialog } from "#/components/ui/confirm-dialog";
import { Glyph } from "#/components/ui/glyph";
import { ValueChip } from "#/components/ui/value-chip";
import type { ConfigHistoryEntryView } from "#/lib/dashboard-data";
import {
  fieldLabel,
  moduleEmoji,
  moduleLabel,
  type ModuleLabelIndex,
} from "#/lib/config-labels";
import {
  formatConfigValue,
  formatShortDay,
  formatStamp,
  isUnset,
} from "#/lib/log-format";
import { useServerAction } from "#/lib/use-server-action";

/**
 * Every row is one config write, so the row is the diff: what the setting was,
 * what it became, and the one control that puts the old value back.
 *
 * Restoring re-runs the setting through `config.setConfig`, which writes a
 * history row of its own — so a restore is itself undoable from this list, and
 * the confirmation says so. Where `oldValue` was never set, the worker deletes
 * the key instead of writing it, which is a different action with a different
 * word for it ("Clear"), kept consistent from button to confirmation to result.
 */
export function ConfigHistoryList({
  guildId,
  entries,
  labels,
  memberNames,
}: {
  guildId: string;
  entries: ConfigHistoryEntryView[];
  labels: ModuleLabelIndex;
  memberNames: Record<string, string>;
}) {
  const [target, setTarget] = useState<ConfigHistoryEntryView | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { isPending, error, setError, run } = useServerAction();

  const supersededBy = findSupersedingChanges(entries);

  function confirm() {
    if (!target) return;
    const entry = target;
    run(async () => {
      const result = await rollbackConfigChange(guildId, entry.id);
      if (!result.ok) {
        setError(
          result.error ??
            "The bot didn't apply the change. Check that it is online, then try again.",
        );
        return;
      }
      const setting = `${moduleLabel(labels, entry.moduleName)} → ${fieldLabel(
        labels,
        entry.moduleName,
        entry.key,
      )}`;
      setNotice(
        isUnset(entry.oldValue)
          ? `Cleared ${setting}. It now has no value set.`
          : `Restored ${setting} to ${formatConfigValue(entry.oldValue)}.`,
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

      <ol className="divide-y divide-border">
        {entries.map((entry, index) => {
          const superseded = supersededBy.get(entry.id);
          const clears = isUnset(entry.oldValue);
          const emoji = moduleEmoji(labels, entry.moduleName);
          return (
            <li
              key={entry.id}
              className="rise flex flex-col gap-2 px-4 py-3 transition-colors hover:bg-surface-hover sm:flex-row sm:items-start sm:gap-4"
              style={
                {
                  "--rise-delay": `${Math.min(index * 18, 280)}ms`,
                } as React.CSSProperties
              }
            >
              <div className="flex min-w-0 shrink-0 items-start gap-2 sm:w-56">
                {emoji ? <Glyph emoji={emoji} size="sm" /> : null}
                <div className="min-w-0">
                  <p className="truncate text-[13px] text-fg">
                    {fieldLabel(labels, entry.moduleName, entry.key)}
                  </p>
                  <p className="truncate text-[11px] text-fg-subtle">
                    {moduleLabel(labels, entry.moduleName)}
                    <span className="font-mono"> · {entry.key}</span>
                  </p>
                </div>
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <ValueChip text={chipText(entry.oldValue)} />
                  <ArrowRight aria-hidden className="size-3.5 text-fg-subtle" />
                  <span className="sr-only">changed to</span>
                  <ValueChip text={chipText(entry.newValue)} emphasis />
                </div>
                {superseded ? (
                  <p className="mt-1 text-[11px] text-fg-subtle">
                    Changed again on {formatShortDay(superseded)} — this is no
                    longer the live value.
                  </p>
                ) : null}
              </div>

              <div className="flex shrink-0 items-center justify-between gap-3 sm:w-64 sm:justify-end">
                <p className="min-w-0 text-[11px] text-fg-muted sm:text-right">
                  <span className="block truncate">
                    {memberNames[entry.actorId] ?? entry.actorId}
                  </span>
                  <span className="tabular block text-fg-subtle">
                    {formatStamp(entry.createdAt)}
                  </span>
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={
                    clears
                      ? `Clear ${fieldLabel(labels, entry.moduleName, entry.key)}`
                      : `Restore ${fieldLabel(labels, entry.moduleName, entry.key)} to ${formatConfigValue(entry.oldValue)}`
                  }
                  onClick={() => {
                    setError(null);
                    setNotice(null);
                    setTarget(entry);
                  }}
                >
                  <RotateCcw aria-hidden />
                  {clears ? "Clear" : "Restore"}
                </Button>
              </div>
            </li>
          );
        })}
      </ol>

      <ConfirmDialog
        open={target !== null}
        title={
          target
            ? isUnset(target.oldValue)
              ? `Clear ${fieldLabel(labels, target.moduleName, target.key)}?`
              : `Restore ${fieldLabel(labels, target.moduleName, target.key)}?`
            : "Restore setting"
        }
        description={
          target ? (
            <RestoreExplanation entry={target} labels={labels} />
          ) : null
        }
        confirmLabel={
          target && isUnset(target.oldValue) ? "Clear setting" : "Restore value"
        }
        pendingLabel={
          target && isUnset(target.oldValue) ? "Clearing…" : "Restoring…"
        }
        pending={isPending}
        error={error}
        onConfirm={confirm}
        onClose={close}
      >
        {target && supersededBy.get(target.id) ? (
          <Alert variant="warning" className="mt-1">
            This setting was changed again on{" "}
            <span className="tabular">
              {formatShortDay(supersededBy.get(target.id)!)}
            </span>
            . Going back to this row&rsquo;s earlier value discards that later
            change too.
          </Alert>
        ) : null}
      </ConfirmDialog>
    </>
  );
}

function RestoreExplanation({
  entry,
  labels,
}: {
  entry: ConfigHistoryEntryView;
  labels: ModuleLabelIndex;
}) {
  const setting = `${moduleLabel(labels, entry.moduleName)} → ${fieldLabel(
    labels,
    entry.moduleName,
    entry.key,
  )}`;
  if (isUnset(entry.oldValue)) {
    return (
      <>
        {setting} had no value before this change, so putting it back removes
        the setting entirely and the module falls back to its default. Its
        current value, {formatConfigValue(entry.newValue)}, is discarded. This
        is recorded as a change of its own, so it can be undone from this list.
      </>
    );
  }
  return (
    <>
      {setting} goes back to {formatConfigValue(entry.oldValue)}, replacing{" "}
      {formatConfigValue(entry.newValue)}. No other setting is touched, and the
      restore is recorded as a change of its own, so it can be undone from this
      list.
    </>
  );
}

function chipText(value: unknown): string | null {
  return isUnset(value) ? null : formatConfigValue(value);
}

/**
 * Rows arrive newest-first, so the first time a `module.key` pair is seen on a
 * page it is the most recent change to it and every later row for that pair
 * has been overtaken. Only provable within the page — a row with no match here
 * is not claimed to be current.
 */
function findSupersedingChanges(
  entries: ConfigHistoryEntryView[],
): Map<string, string> {
  const newest = new Map<string, string>();
  const superseded = new Map<string, string>();
  for (const entry of entries) {
    const pair = `${entry.moduleName} ${entry.key}`;
    const seen = newest.get(pair);
    if (seen) superseded.set(entry.id, seen);
    else newest.set(pair, entry.createdAt);
  }
  return superseded;
}
