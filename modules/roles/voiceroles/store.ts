import type { ModuleServices } from "@lumi/module-kit";
import type { VoiceRoleMapping } from "./logic.js";

function prismaOf(services: ModuleServices): any {
  return services.db.prisma;
}

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
  return prismaOf(services).voiceRole.findMany({
    where: { guildId },
    orderBy: { channelId: "asc" },
  });
}

export async function getVoiceRoleMapping(
  services: ModuleServices,
  guildId: string,
  channelId: string,
): Promise<VoiceRoleMapping | null> {
  return prismaOf(services).voiceRole.findUnique({
    where: { guildId_channelId: { guildId, channelId } },
  });
}

export async function upsertVoiceRoleMapping(
  services: ModuleServices,
  input: UpsertVoiceRoleInput,
): Promise<VoiceRoleMapping> {
  return prismaOf(services).voiceRole.upsert({
    where: {
      guildId_channelId: {
        guildId: input.guildId,
        channelId: input.channelId,
      },
    },
    update: {
      categoryId: input.categoryId,
      roleId: input.roleId,
      graceSeconds: input.graceSeconds,
      enabled: true,
    },
    create: {
      guildId: input.guildId,
      channelId: input.channelId,
      categoryId: input.categoryId,
      roleId: input.roleId,
      graceSeconds: input.graceSeconds,
    },
  });
}

export async function deleteVoiceRoleMapping(
  services: ModuleServices,
  guildId: string,
  channelId: string,
): Promise<boolean> {
  const prisma = prismaOf(services);
  await prisma.voiceRoleSession
    .deleteMany({ where: { guildId, channelId } })
    .catch(() => undefined);
  const result = await prisma.voiceRole.deleteMany({
    where: { guildId, channelId },
  });
  return result.count > 0;
}

export async function setVoiceRoleEnabled(
  services: ModuleServices,
  guildId: string,
  channelId: string,
  enabled: boolean,
): Promise<VoiceRoleMapping | null> {
  const existing = await getVoiceRoleMapping(services, guildId, channelId);
  if (!existing) return null;
  return prismaOf(services).voiceRole.update({
    where: { id: (existing as unknown as { id: string }).id },
    data: { enabled },
  });
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
  return prismaOf(services).voiceRoleSession.upsert({
    where: {
      guildId_userId_channelId_roleId: {
        guildId: input.guildId,
        userId: input.userId,
        channelId: input.channelId,
        roleId: input.roleId,
      },
    },
    update: { graceUntil: null, joinedAt: new Date(input.nowMs) },
    create: {
      guildId: input.guildId,
      userId: input.userId,
      channelId: input.channelId,
      roleId: input.roleId,
      joinedAt: new Date(input.nowMs),
    },
  });
}

export async function findVoiceSessions(
  services: ModuleServices,
  guildId: string,
  userId: string,
  channelId: string,
): Promise<VoiceSession[]> {
  return prismaOf(services).voiceRoleSession.findMany({
    where: { guildId, userId, channelId },
  });
}

export async function markVoiceSessionGrace(
  services: ModuleServices,
  sessionId: string,
  graceUntil: Date,
): Promise<void> {
  await prismaOf(services).voiceRoleSession.update({
    where: { id: sessionId },
    data: { graceUntil },
  });
}

export async function deleteVoiceSession(
  services: ModuleServices,
  sessionId: string,
): Promise<void> {
  await prismaOf(services)
    .voiceRoleSession.delete({ where: { id: sessionId } })
    .catch(() => undefined);
}

export async function listExpiredVoiceSessions(
  services: ModuleServices,
  nowMs: number,
  limit = 200,
): Promise<VoiceSession[]> {
  return prismaOf(services).voiceRoleSession.findMany({
    where: { graceUntil: { not: null, lte: new Date(nowMs) } },
    orderBy: { graceUntil: "asc" },
    take: limit,
  });
}

export async function deleteVoiceSessionsForChannel(
  services: ModuleServices,
  guildId: string,
  channelId: string,
): Promise<void> {
  await prismaOf(services)
    .voiceRoleSession.deleteMany({ where: { guildId, channelId } })
    .catch(() => undefined);
}
