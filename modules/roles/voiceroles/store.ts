import type { ModuleServices } from "@lumi/module-kit";
import type { VoiceRoleMapping } from "./logic.js";

export interface UpsertVoiceRoleInput {
  readonly guildId: string;
  readonly channelId: string;
  readonly categoryId: string | null;
  readonly roleId: string;
  readonly graceSeconds: number;
}

export async function listVoiceRoleMappings(
  services: ModuleServices,
  guildId: string,
): Promise<VoiceRoleMapping[]> {
  return services.helpers.roles.voiceRole.listMappings(guildId);
}

export async function getVoiceRoleMapping(
  services: ModuleServices,
  guildId: string,
  channelId: string,
): Promise<VoiceRoleMapping | null> {
  return services.helpers.roles.voiceRole.findMapping(guildId, channelId);
}

export async function upsertVoiceRoleMapping(
  services: ModuleServices,
  input: UpsertVoiceRoleInput,
): Promise<VoiceRoleMapping> {
  return services.helpers.roles.voiceRole.upsertMapping(input);
}

export async function deleteVoiceRoleMapping(
  services: ModuleServices,
  guildId: string,
  channelId: string,
): Promise<boolean> {
  return services.helpers.roles.voiceRole.deleteMapping(guildId, channelId);
}

export async function setVoiceRoleEnabled(
  services: ModuleServices,
  guildId: string,
  channelId: string,
  enabled: boolean,
): Promise<VoiceRoleMapping | null> {
  return services.helpers.roles.voiceRole.setEnabled(
    guildId,
    channelId,
    enabled,
  );
}

export interface VoiceSession {
  readonly id: string;
  readonly guildId: string;
  readonly userId: string;
  readonly channelId: string;
  readonly roleId: string;
  readonly joinedAt: Date;
  readonly graceUntil: Date | null;
}

export async function upsertVoiceSession(
  services: ModuleServices,
  input: {
    guildId: string;
    userId: string;
    channelId: string;
    roleId: string;
    nowMs: number;
  },
): Promise<VoiceSession> {
  return services.helpers.roles.voiceRole.upsertSession(input);
}

export async function findVoiceSessions(
  services: ModuleServices,
  guildId: string,
  userId: string,
  channelId: string,
): Promise<VoiceSession[]> {
  return services.helpers.roles.voiceRole.findSessions(
    guildId,
    userId,
    channelId,
  );
}

export async function markVoiceSessionGrace(
  services: ModuleServices,
  sessionId: string,
  graceUntil: Date,
): Promise<void> {
  await services.helpers.roles.voiceRole.markSessionGrace(
    sessionId,
    graceUntil,
  );
}

export async function deleteVoiceSession(
  services: ModuleServices,
  sessionId: string,
): Promise<void> {
  await services.helpers.roles.voiceRole.deleteSession(sessionId);
}

export async function listExpiredVoiceSessions(
  services: ModuleServices,
  nowMs: number,
  limit = 200,
): Promise<VoiceSession[]> {
  return services.helpers.roles.voiceRole.listExpiredSessions(nowMs, limit);
}
