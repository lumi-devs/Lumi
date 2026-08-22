"use client";

import Link from "next/link";
import { Badge } from "#/components/ui/badge";
import { useStaggerIn } from "#/lib/animate";
import { cn } from "#/lib/utils";
import {
  fieldLabel,
  fieldType,
  moduleLabel,
  resolveConfigValue,
  type ModuleLabelIndex,
} from "#/lib/config-labels";
import type {
  AuditEntryView,
  DashboardChannelView,
  DashboardRoleView,
} from "#/lib/dashboard-data";
import {
  formatTime,
  groupByDay,
  humanizeKey,
  isSnowflake,
  splitAction,
} from "#/lib/log-format";

interface ConfigChangeDetails {
  moduleName: string;
  key: string;
  value: unknown;
}

function asConfigChangeDetails(details: unknown): ConfigChangeDetails | null {
  if (typeof details !== "object" || details === null) return null;
  const record = details as Record<string, unknown>;
  if (
    typeof record["moduleName"] === "string" &&
    typeof record["key"] === "string"
  ) {
    return {
      moduleName: record["moduleName"],
      key: record["key"],
      value: record["value"],
    };
  }
  return null;
}

function objectDetailEntries(details: unknown): [string, unknown][] | null {
  if (typeof details !== "object" || details === null || Array.isArray(details)) {
    return null;
  }
  return Object.entries(details as Record<string, unknown>);
}

function resolveDetailValue(
  value: unknown,
  roles: DashboardRoleView[] | undefined,
  channels: DashboardChannelView[] | undefined,
): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "On" : "Off";
  if (typeof value === "string" && isSnowflake(value)) {
    const role = roles?.find((r) => r.id === value);
    if (role) return `@${role.name}`;
    const channel = channels?.find((c) => c.id === value);
    if (channel) return `#${channel.name}`;
    return value;
  }
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function AuditTimeline({
  entries,
  labels,
  roles,
  channels,
  guildHref,
}: {
  entries: AuditEntryView[];
  labels?: ModuleLabelIndex;
  roles?: DashboardRoleView[];
  channels?: DashboardChannelView[];
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
          <h4 className="font-display flex items-baseline justify-between gap-3 border-y border-border bg-bg-subtle px-4 py-1.5 text-[13px] font-semibold tracking-[0.09em] text-fg-subtle uppercase">
            <span>{day.label}</span>
            <span className="tabular">
              {day.items.length} {day.items.length === 1 ? "entry" : "entries"}
            </span>
          </h4>

          <ol>
            {day.items.map((entry) => (
              <li key={entry.id}>
                <AuditRow
                  entry={entry}
                  labels={labels}
                  roles={roles}
                  channels={channels}
                  guildHref={guildHref}
                />
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
  labels,
  roles,
  channels,
  guildHref,
}: {
  entry: AuditEntryView;
  labels?: ModuleLabelIndex;
  roles?: DashboardRoleView[];
  channels?: DashboardChannelView[];
  guildHref?: (guildId: string) => string;
}) {
  const { scope, verb } = splitAction(entry.action);
  const configChange = labels ? asConfigChangeDetails(entry.details) : null;
  const entries = configChange ? null : objectDetailEntries(entry.details);

  return (
    <div className="group flex gap-3 px-4 transition-colors hover:bg-surface-hover">
      <time
        dateTime={entry.createdAt}
        className="tabular w-[4.5rem] shrink-0 pt-2.5 font-mono text-[13px] text-fg-subtle"
      >
        {formatTime(entry.createdAt)}
      </time>

      <div
        aria-hidden
        className="relative w-px shrink-0 bg-border before:absolute before:top-[13px] before:-left-[3px] before:size-[7px] before:rounded-full before:border before:border-border-strong before:bg-surface"
      />

      <div className="min-w-0 flex-1 py-2 pl-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="font-mono text-[14px] text-fg">
            {scope ? (
              <span className="text-fg-subtle">{scope}.</span>
            ) : null}
            <span className="font-semibold">{verb}</span>
          </span>
          <Badge variant="outline">
            {entry.platform === "web" ? "Dashboard" : entry.platform}
          </Badge>
        </div>

        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[13px] text-fg-muted">
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

        {configChange && labels ? (
          <p className="mt-1.5 text-[13px] text-fg-muted">
            <span className="font-semibold text-fg">
              {moduleLabel(labels, configChange.moduleName)} →{" "}
              {fieldLabel(labels, configChange.moduleName, configChange.key)}
            </span>{" "}
            set to{" "}
            <span className="font-mono text-fg">
              {resolveConfigValue(
                fieldType(labels, configChange.moduleName, configChange.key),
                configChange.value,
                roles ?? [],
                channels ?? [],
              )}
            </span>
          </p>
        ) : entries && entries.length > 0 ? (
          <dl className="mt-1.5 flex flex-col gap-0.5">
            {entries.map(([key, value]) => {
              const resolved = resolveDetailValue(value, roles, channels);
              const isRawId =
                typeof value === "string" &&
                isSnowflake(value) &&
                resolved === value;
              return (
                <div key={key} className="flex gap-1.5 text-[13px]">
                  <dt className="text-fg-subtle">{humanizeKey(key)}:</dt>
                  <dd
                    className={cn(
                      "text-fg-muted",
                      isRawId && "font-mono",
                    )}
                  >
                    {resolved}
                  </dd>
                </div>
              );
            })}
          </dl>
        ) : typeof entry.details === "string" ? (
          <p className="mt-1.5 text-[13px] text-fg-muted">{entry.details}</p>
        ) : null}
      </div>
    </div>
  );
}
