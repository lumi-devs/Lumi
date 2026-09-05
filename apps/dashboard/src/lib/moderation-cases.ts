// Imported by both the server page and the client table so the two can't drift
// in how they label or classify the same row.

export const CaseActionLabels: Record<string, string> = {
  ban: "Ban",
  unban: "Unban",
  softban: "Softban",
  kick: "Kick",
  mute: "Mute",
  unmute: "Unmute",
  voice_mute: "Voice mute",
  unvoice_mute: "Voice unmute",
  quarantine: "Quarantine",
  unquarantine: "Unquarantine",
  warn: "Warn",
  antinuke_alert: "Anti-nuke alert",
};

// Revoking one of these in the dashboard only closes the record; it does not
// lift the restriction in Discord — see `moderation-cases-table`.
const RestrictingActions = new Set([
  "ban",
  "softban",
  "mute",
  "voice_mute",
  "quarantine",
]);

/** Actions the bot's scheduled lift task can undo in Discord when they expire. */
const AutoLiftedActions = new Set(["ban", "mute", "voice_mute"]);

export function caseActionLabel(action: string): string {
  return (
    CaseActionLabels[action] ??
    action.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())
  );
}

export function isRestrictingAction(action: string): boolean {
  return RestrictingActions.has(action);
}

export function isAutoLiftedAction(action: string): boolean {
  return AutoLiftedActions.has(action);
}

export const CaseActionOptions = Object.entries(CaseActionLabels).map(
  ([value, label]) => ({ value, label }),
);

/** `"0"` is what a GDPR erasure leaves behind in `userId`/`moderatorId`. */
export const AnonymizedId = "0";

const Snowflake = /^\d{15,20}$/;

export function isSnowflake(value: string): boolean {
  return Snowflake.test(value);
}

// Formatted in UTC so a Server Component and the client that hydrates it can
// never disagree about the rendered string.
const DateFormat = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

export function formatCaseDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return `${DateFormat.format(date)} UTC`;
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const units: [number, string][] = [
    [86_400, "d"],
    [3600, "h"],
    [60, "m"],
  ];
  const parts: string[] = [];
  let rest = seconds;
  for (const [size, suffix] of units) {
    const value = Math.floor(rest / size);
    if (value > 0) parts.push(`${value}${suffix}`);
    rest -= value * size;
    if (parts.length === 2) break;
  }
  return parts.join(" ");
}
