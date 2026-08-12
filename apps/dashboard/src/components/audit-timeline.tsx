"use client";

import Link from "next/link";
import { Badge } from "#/components/ui/badge";
import { useStaggerIn } from "#/lib/animate";
import type { AuditEntryView } from "#/lib/dashboard-data";
import {
  formatDetails,
  formatTime,
  groupByDay,
  splitAction,
} from "#/lib/log-format";

export function AuditTimeline({
  entries,
  guildHref,
}: {
  entries: AuditEntryView[];
  guildHref?: (guildId: string) => string;
}) {
  const days = groupByDay(entries, (e) => e.createdAt);
  const ref = useStaggerIn<HTMLDivElement>("li", {
    delay: 18,
    resetKey: entries.map((e) => e.id).join(","),
  });

  return (
    <div ref={ref}>
      {days.map((day) => (
        <section key={day.key} aria-label={day.label}>
          <h4 className="font-display flex items-baseline justify-between gap-3 border-y border-border bg-bg-subtle px-4 py-1.5 text-[11px] font-semibold tracking-[0.09em] text-fg-subtle uppercase">
            <span>{day.label}</span>
            <span className="tabular">
              {day.items.length} {day.items.length === 1 ? "entry" : "entries"}
            </span>
          </h4>

          <ol>
            {day.items.map((entry) => (
              <li key={entry.id}>
                <AuditRow entry={entry} guildHref={guildHref} />
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

function AuditRow({
  entry,
  guildHref,
}: {
  entry: AuditEntryView;
  guildHref?: (guildId: string) => string;
}) {
  const { scope, verb } = splitAction(entry.action);
  const details = formatDetails(entry.details);

  return (
    <div className="group flex gap-3 px-4 transition-colors hover:bg-surface-hover">
      <time
        dateTime={entry.createdAt}
        className="tabular w-[4.5rem] shrink-0 pt-2.5 font-mono text-[11px] text-fg-subtle"
      >
        {formatTime(entry.createdAt)}
      </time>

      <div
        aria-hidden
        className="relative w-px shrink-0 bg-border before:absolute before:top-[13px] before:-left-[3px] before:size-[7px] before:rounded-full before:border before:border-border-strong before:bg-surface"
      />

      <div className="min-w-0 flex-1 py-2 pl-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="font-mono text-[12px] text-fg">
            {scope ? (
              <span className="text-fg-subtle">{scope}.</span>
            ) : null}
            <span className="font-semibold">{verb}</span>
          </span>
          <Badge variant="outline">
            {entry.platform === "web" ? "Dashboard" : entry.platform}
          </Badge>
        </div>

        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-fg-muted">
          <span>
            by{" "}
            <span className="tabular font-mono text-fg-subtle">
              {entry.userId}
            </span>
          </span>
          {guildHref ? (
            <span>
              in{" "}
              <Link
                href={guildHref(entry.guildId)}
                className="tabular font-mono text-accent-fg underline-offset-4 hover:underline"
              >
                {entry.guildId}
              </Link>
            </span>
          ) : null}
        </div>

        {details ? (
          <details className="mt-1.5">
            <summary className="font-display inline-flex cursor-pointer text-[11px] tracking-[0.02em] text-fg-subtle hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]">
              What was recorded
            </summary>
            <pre className="mt-1.5 max-w-full overflow-x-auto rounded border border-border bg-bg-subtle px-2.5 py-2 font-mono text-[11px] leading-5 text-fg-muted">
              {details}
            </pre>
          </details>
        ) : null}
      </div>
    </div>
  );
}
