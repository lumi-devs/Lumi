import type { ModuleServices } from "@lumi/module-kit";
import type { VoiceState } from "discord.js";
import { addMemberRoles, fetchMember, removeMemberRoles } from "../shared.js";
import { getVoiceRolesConfig, VoiceRolesModuleName } from "./config.js";
import { resolveGraceUntil, selectVoiceRoleMapping } from "./logic.js";
import {
  deleteVoiceSession,
  findVoiceSessions,
  getVoiceRoleMapping,
  listExpiredVoiceSessions,
  listVoiceRoleMappings,
  markVoiceSessionGrace,
  upsertVoiceSession,
} from "./store.js";

export async function handleVoiceStateUpdate(
  oldState: VoiceState,
  newState: VoiceState,
  services: ModuleServices,
): Promise<void> {
  const guild = newState.guild ?? oldState.guild;
  if (!guild) return;
  if (!services.modules.isEnabled(guild.id, VoiceRolesModuleName)) return;
  const config = await getVoiceRolesConfig(services, guild.id);
  if (!config.enabled) return;

  const userId = newState.id;
  const nowMs = Date.now();

  if (oldState.channelId && oldState.channelId !== newState.channelId) {
    const sessions = await findVoiceSessions(
      services,
      guild.id,
      userId,
      oldState.channelId,
    );
    for (const session of sessions) {
      const mapping = await getVoiceRoleMapping(
        services,
        guild.id,
        session.channelId,
      );
      const graceSeconds = mapping?.graceSeconds ?? config.defaultGraceSeconds;
      if (graceSeconds > 0) {
        const graceUntil = resolveGraceUntil(nowMs, graceSeconds);
        if (graceUntil) {
          await markVoiceSessionGrace(services, session.id, graceUntil);
        }
        continue;
      }
      const member = await fetchMember(guild, session.userId);
      if (member) {
        await removeMemberRoles(
          services,
          guild,
          member,
          [session.roleId],
          "Voice role removed",
        );
      }
      await deleteVoiceSession(services, session.id);
    }
  }

  if (!newState.channelId || oldState.channelId === newState.channelId) {
    return;
  }
  const channel = newState.channel;
  if (!channel?.isVoiceBased()) return;
  const member = newState.member;
  if (!member || member.user.bot) return;

  const mappings = await listVoiceRoleMappings(services, guild.id);
  const mapping = selectVoiceRoleMapping(
    mappings,
    channel.id,
    channel.parentId,
  );
  if (!mapping) return;

  const existingSessions = await findVoiceSessions(
    services,
    guild.id,
    member.id,
    channel.id,
  );
  const hasRole = member.roles.cache.has(mapping.roleId);
  const tracked =
    existingSessions.some((session) => session.roleId === mapping.roleId) ||
    !hasRole;
  if (!tracked) return;

  await upsertVoiceSession(services, {
    guildId: guild.id,
    userId: member.id,
    channelId: channel.id,
    roleId: mapping.roleId,
    nowMs,
  });
  await addMemberRoles(
    services,
    guild,
    member,
    [mapping.roleId],
    "Voice role assigned",
  );
}

export async function expireVoiceGraceSessions(
  services: ModuleServices,
  nowMs = Date.now(),
): Promise<{ removed: number; failed: number }> {
  const sessions = await listExpiredVoiceSessions(services, nowMs);
  let removed = 0;
  let failed = 0;
  for (const session of sessions) {
    if (!services.modules.isEnabled(session.guildId, VoiceRolesModuleName)) {
      continue;
    }
    const guild = services.client.guilds.cache.get(session.guildId);
    if (!guild) {
      await deleteVoiceSession(services, session.id);
      failed += 1;
      continue;
    }
    const member = await fetchMember(guild, session.userId);
    if (!member) {
      await deleteVoiceSession(services, session.id);
      continue;
    }
    const result = await removeMemberRoles(
      services,
      guild,
      member,
      [session.roleId],
      "Voice role grace expired",
    );
    if (result.failed.length === 0) {
      await deleteVoiceSession(services, session.id);
      removed += 1;
    } else {
      failed += 1;
    }
  }
  return { removed, failed };
}
