export const Time = {
  Second: 1_000,
  Minute: 60_000,
  Hour: 3_600_000,
  Day: 86_400_000,
} as const;

export function duration(ms: number): string {
  const seconds = Math.floor(ms / Time.Second);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function since(date: Date, now = Date.now()): string {
  return duration(Math.max(0, now - date.getTime()));
}
