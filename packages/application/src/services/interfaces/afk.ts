export interface IAfkFormatter {
  sanitizeReason(raw: string): string;
  afkDurationSince(since: Date | number): string;
}
