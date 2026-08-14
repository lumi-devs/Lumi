"use client";

import { useState } from "react";
import type { WarnThresholdAction } from "@lumi/contracts";
import {
  deleteWarnThreshold,
  setWarnThreshold,
} from "#/actions/moderation-actions";
import { ActionError } from "#/components/action-error";
import { Alert } from "#/components/ui/alert";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { ConfirmDialog } from "#/components/ui/confirm-dialog";
import { EmptyState } from "#/components/ui/empty-state";
import { Field, Input, Select } from "#/components/ui/input";
import { TriangleAlert } from "lucide-react";
import type { WarnThresholdView } from "#/lib/dashboard-data";
import { useServerAction } from "#/lib/use-server-action";
import { useStaggerIn } from "#/lib/animate";

// `checkThresholds` picks the single highest rule at or below the member's warn
// count, so rules are ranges rather than a checklist — the ladder shows them
// that way.
const ACTIONS: {
  value: WarnThresholdAction;
  label: string;
  duration: "required" | "unused";
}[] = [
  { value: "mute", label: "Mute", duration: "required" },
  { value: "kick", label: "Kick", duration: "unused" },
  { value: "ban", label: "Ban", duration: "unused" },
  { value: "quarantine", label: "Quarantine", duration: "unused" },
  { value: "vcmute", label: "Voice mute", duration: "required" },
];

const ACTION_BY_VALUE = new Map(ACTIONS.map((a) => [a.value, a]));

export function WarnThresholdLadder({
  guildId,
  thresholds,
}: {
  guildId: string;
  thresholds: WarnThresholdView[];
}) {
  const [target, setTarget] = useState<WarnThresholdView | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { isPending, error, setError, run } = useServerAction();
  const rungsRef = useStaggerIn<HTMLOListElement>("> li");

  const rungs = [...thresholds].sort((a, b) => a.warnCount - b.warnCount);

  function confirmRemove() {
    if (!target) return;
    const { warnCount } = target;
    run(async () => {
      const result = await deleteWarnThreshold(guildId, warnCount);
      if (!result.ok) {
        setError(
          result.error ?? "Removing the rule failed. Try again in a moment.",
        );
        return;
      }
      setNotice(`Rule at ${warnCount} warns removed.`);
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

      {rungs.length === 0 ? (
        <EmptyState
          icon={TriangleAlert}
          title="Warns don't escalate yet"
          description="Right now a warn only writes a case. Add a rule below and Lumi acts on its own once a member reaches that many warns — a mute at 3 is the usual first rung."
        />
      ) : (
        <ol ref={rungsRef} className="flex flex-col divide-y divide-border-soft px-4 py-3">
          {rungs.map((rung, index) => (
            <Rung
              key={rung.warnCount}
              rung={rung}
              nextCount={rungs[index + 1]?.warnCount}
              last={index === rungs.length - 1}
              onRemove={() => {
                setError(null);
                setNotice(null);
                setTarget(rung);
              }}
            />
          ))}
        </ol>
      )}

      <RuleForm
        guildId={guildId}
        existing={rungs}
        onSaved={(message) => {
          setNotice(message);
        }}
      />

      <ConfirmDialog
        open={target !== null}
        title={
          target ? `Remove the rule at ${target.warnCount} warns?` : "Remove rule"
        }
        description={
          target ? (
            <>
              Members who reach {target.warnCount} warns will fall back to the
              next rule below it, or to no action at all if there isn&rsquo;t
              one. Warns already recorded are untouched.
            </>
          ) : null
        }
        confirmLabel="Remove rule"
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

function Rung({
  rung,
  nextCount,
  last,
  onRemove,
}: {
  rung: WarnThresholdView;
  nextCount: number | undefined;
  last: boolean;
  onRemove: () => void;
}) {
  const meta = ACTION_BY_VALUE.get(rung.action);
  const label = meta?.label ?? rung.action;
  const durationMissing = meta?.duration === "required" && !rung.duration;

  return (
    <li className="relative flex gap-3 py-3 first:pt-0 last:pb-0">
      <div className="relative flex w-8 shrink-0 justify-center">
        {last ? null : (
          <span
            aria-hidden
            className="absolute top-8 bottom-0 left-1/2 w-px -translate-x-1/2 bg-border"
          />
        )}
        <span className="tabular relative flex size-8 items-center justify-center rounded-control border border-border bg-bg-subtle font-mono text-[13px] text-fg">
          {rung.warnCount}
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="font-display text-[13px] leading-8 font-semibold tracking-[0.01em] text-fg">
            {label}
            {rung.duration ? (
              <span className="text-fg-muted"> for {rung.duration}</span>
            ) : null}
          </p>
          {durationMissing ? (
            <Badge variant="warning" dot>
              No duration set
            </Badge>
          ) : null}
          <span className="ml-auto">
            <Button
              variant="dangerGhost"
              size="sm"
              onClick={onRemove}
              aria-label={`Remove the rule at ${rung.warnCount} warns`}
            >
              Remove
            </Button>
          </span>
        </div>

        <p className="text-[12px] leading-5 text-fg-muted">
          {nextCount === undefined
            ? `Applies from ${rung.warnCount} warns onwards.`
            : `Applies from ${rung.warnCount} warns until ${nextCount}, where the next rule takes over.`}
        </p>

        {durationMissing ? (
          <Alert variant="warning" className="mt-2">
            This rule predates duration checks and has none stored, so Lumi
            falls back to 1 hour when it fires. Save it again with the duration
            you want.
          </Alert>
        ) : null}
      </div>
    </li>
  );
}

function RuleForm({
  guildId,
  existing,
  onSaved,
}: {
  guildId: string;
  existing: WarnThresholdView[];
  onSaved: (message: string) => void;
}) {
  const [warnCount, setWarnCount] = useState("");
  const [action, setAction] = useState<WarnThresholdAction>("mute");
  const [duration, setDuration] = useState("1h");
  const { isPending, error, setError, run } = useServerAction();

  const meta = ACTION_BY_VALUE.get(action)!;
  const count = Number.parseInt(warnCount, 10);
  const replaces = existing.find((r) => r.warnCount === count);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!Number.isInteger(count) || count < 1) {
      setError("Warn count has to be a whole number of 1 or more.");
      return;
    }
    const trimmed = duration.trim();
    if (meta.duration === "required" && !trimmed) {
      setError(`A ${meta.label.toLowerCase()} needs a duration — try 1h.`);
      return;
    }
    run(async () => {
      const result = await setWarnThreshold(
        guildId,
        count,
        action,
        meta.duration === "required" ? trimmed : null,
      );
      if (!result.ok) {
        setError(result.error ?? "Saving the rule failed. Try again.");
        return;
      }
      onSaved(
        replaces
          ? `Rule at ${count} warns replaced with ${meta.label.toLowerCase()}.`
          : `Rule added: ${meta.label.toLowerCase()} at ${count} warns.`,
      );
      setWarnCount("");
    });
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-3 border-t border-border bg-bg-subtle px-4 py-3"
    >
      <div className="flex flex-wrap items-end gap-3">
        <Field
          label="At this many warns"
          htmlFor="threshold-count"
          className="w-32 gap-1"
        >
          <Input
            id="threshold-count"
            value={warnCount}
            inputMode="numeric"
            placeholder="3"
            onChange={(e) => setWarnCount(e.target.value)}
          />
        </Field>

        <Field label="Lumi applies" htmlFor="threshold-action" className="w-44 gap-1">
          <Select
            id="threshold-action"
            value={action}
            onChange={(e) => setAction(e.target.value as WarnThresholdAction)}
          >
            {ACTIONS.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="For"
          htmlFor="threshold-duration"
          className="w-32 gap-1"
          hint={meta.duration === "required" ? "e.g. 30m, 2h, 7d" : undefined}
        >
          <Input
            id="threshold-duration"
            value={meta.duration === "required" ? duration : ""}
            disabled={meta.duration !== "required"}
            placeholder={meta.duration === "required" ? "1h" : "Not used"}
            onChange={(e) => setDuration(e.target.value)}
          />
        </Field>

        <Button type="submit" variant="primary" disabled={isPending}>
          {isPending
            ? "Saving…"
            : replaces
              ? "Replace rule"
              : "Add rule"}
        </Button>
      </div>

      {replaces ? (
        <Alert variant="warning">
          {count} warns already applies{" "}
          {(ACTION_BY_VALUE.get(replaces.action)?.label ?? replaces.action).toLowerCase()}
          {replaces.duration ? ` for ${replaces.duration}` : ""}. Saving replaces
          it.
        </Alert>
      ) : null}
      {action === "quarantine" ? (
        <Alert variant="info">
          Quarantine needs a quarantine role configured for this server —
          without one the rule fires but has nothing to apply.
        </Alert>
      ) : null}
      <ActionError error={error} />
    </form>
  );
}
