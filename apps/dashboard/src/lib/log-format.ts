export { isSnowflake } from "./moderation-cases";
import type { DashboardMemberView } from "./dashboard-data";

// Formatted in UTC so a Server Component and the client that hydrates it can
// never disagree about the rendered string.
const DAY_FORMAT = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const TIME_FORMAT = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
  timeZone: "UTC",
});

const STAMP_FORMAT = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

const SHORT_DAY_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function parse(iso: string): Date | null {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDay(iso: string): string {
  const date = parse(iso);
  return date ? DAY_FORMAT.format(date) : "Unknown date";
}

export function formatShortDay(iso: string): string {
  const date = parse(iso);
  return date ? SHORT_DAY_FORMAT.format(date) : "Unknown";
}

export function formatTime(iso: string): string {
  const date = parse(iso);
  return date ? TIME_FORMAT.format(date) : "--:--:--";
}

export function formatStamp(iso: string): string {
  const date = parse(iso);
  return date ? `${STAMP_FORMAT.format(date)} UTC` : "Unknown";
}

export interface DayGroup<T> {
  key: string;
  label: string;
  items: T[];
}

// Groups runs of consecutive days rather than keying by day, so a list that
// isn't strictly sorted still renders every row in the order the server sent it.
export function groupByDay<T>(
  items: T[],
  timestamp: (item: T) => string,
): DayGroup<T>[] {
  const groups: DayGroup<T>[] = [];
  for (const item of items) {
    const iso = timestamp(item);
    const key = parse(iso) ? iso.slice(0, 10) : "unknown";
    const last = groups.at(-1);
    if (last && last.key === key) last.items.push(item);
    else groups.push({ key, label: formatDay(iso), items: [item] });
  }
  return groups;
}

export function formatConfigValue(value: unknown): string {
  if (value === null || value === undefined) return "Not set";
  if (typeof value === "boolean") return value ? "On" : "Off";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value === "" ? "Empty" : value;
  if (Array.isArray(value)) {
    return value.length === 0 ? "Empty list" : value.map(String).join(", ");
  }
  return JSON.stringify(value);
}

export function isUnset(value: unknown): boolean {
  return value === null || value === undefined;
}

export function humanizeKey(key: string): string {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .split(/\s+/);
  return words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

export function formatDetails(details: unknown): string | null {
  if (details === null || details === undefined) return null;
  if (typeof details === "string") return details;
  try {
    return JSON.stringify(details, null, 2);
  } catch {
    return String(details);
  }
}

// Audit actions are dotted namespaces (`guild.config.update`): the last segment
// is what happened, the rest is where. Split so a column of them scans on the
// verb instead of on a shared prefix.
export function splitAction(action: string): {
  scope: string | null;
  verb: string;
} {
  const index = action.lastIndexOf(".");
  if (index <= 0) return { scope: null, verb: action };
  return { scope: action.slice(0, index), verb: action.slice(index + 1) };
}

export const AUDIT_PLATFORM_OPTIONS = [
  { value: "discord", label: "Discord" },
  { value: "web", label: "Dashboard" },
];

export function single(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.trim() ?? "";
}

export function pageNumber(value: string): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export function filterHref(
  path: string,
  filters: Record<string, string>,
): string {
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(filters)) {
    if (value) params.set(name, value);
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

export function extractMemberNames(
  members: DashboardMemberView[],
): Record<string, string> {
  return Object.fromEntries(
    members.map((m) => [m.id, m.displayName || m.username]),
  );
}

/**
 * Measured against a caller-supplied reference time (a telemetry snapshot's
 * own read time, or the server's render time) rather than `Date.now()` — a
 * Server Component and the client that hydrates it must never disagree about
 * the rendered string.
 */
export function since(iso: string | null, referenceIso: string): string {
  if (!iso) return "never";
  const seconds = Math.max(
    0,
    Math.round((Date.parse(referenceIso) - Date.parse(iso)) / 1000),
  );
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86_400)}d ago`;
}
