export interface AuditEntry {
  action: string;
  targetId: string;
  actorId: string;
  guildId: string;
  moduleName?: string;
  reason?: string;
  color?: number;
  caseNumber?: number;
  extra?: Record<string, unknown>;
}
