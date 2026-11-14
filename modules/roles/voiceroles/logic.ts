export interface VoiceRoleMapping {
  readonly guildId: string;
  readonly channelId: string;
  readonly categoryId: string | null;
  readonly roleId: string;
  readonly graceSeconds: number;
  readonly enabled: boolean;
}

export function selectVoiceRoleMapping(
  mappings: readonly VoiceRoleMapping[],
  channelId: string,
  categoryId: string | null,
): VoiceRoleMapping | null {
  const enabled = mappings.filter((mapping) => mapping.enabled);
  const direct = enabled.find((mapping) => mapping.channelId === channelId);
  if (direct) return direct;
  if (!categoryId) return null;
  return enabled.find((mapping) => mapping.categoryId === categoryId) ?? null;
}

export function resolveGraceUntil(
  nowMs: number,
  graceSeconds: number,
): Date | null {
  if (graceSeconds <= 0) return null;
  return new Date(nowMs + graceSeconds * 1000);
}

export function graceUntilMs(value: Date | string | null): number | null {
  if (value === null) return null;
  const ms =
    value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

export function isGraceExpired(
  graceUntil: Date | string | null,
  nowMs: number,
): boolean {
  const ms = graceUntilMs(graceUntil);
  return ms !== null && ms <= nowMs;
}

export function selectExpiredSessions<
  T extends { graceUntil: Date | string | null },
>(sessions: readonly T[], nowMs: number): T[] {
  return sessions.filter((session) =>
    isGraceExpired(session.graceUntil, nowMs),
  );
}

export function shouldRemoveOnLeave(graceSeconds: number): boolean {
  return graceSeconds <= 0;
}
