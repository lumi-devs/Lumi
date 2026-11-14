export interface InactivityTicket {
  id: string;
  guildId: string;
  status: string;
  lastActivityAt: Date | string;
}

function timeOf(value: Date | string): number {
  const date = value instanceof Date ? value : new Date(value);
  return date.getTime();
}

export function selectInactiveTickets<T extends InactivityTicket>(
  tickets: readonly T[],
  now: Date,
  thresholdMs: number,
): T[] {
  if (!Number.isFinite(thresholdMs) || thresholdMs <= 0) return [];
  const cutoff = now.getTime() - thresholdMs;
  return tickets.filter((ticket) => {
    if (ticket.status !== "open") return false;
    const lastActivity = timeOf(ticket.lastActivityAt);
    if (!Number.isFinite(lastActivity)) return false;
    return lastActivity <= cutoff;
  });
}
