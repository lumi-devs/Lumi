import { UserError } from "#src/shared/Index.ts";
import { container } from "#src/lib/Services.js";
import type { Guild, GuildMember, VoiceBasedChannel } from "discord.js";
import type { LumiT } from "#src/lib/i18n/Index.js";
import { getVcRecord, type VcRecord } from "#src/modules/tempvc/data/Tempvc.js";
import { assertOwner } from "#src/modules/tempvc/services/PanelHelpers.js";
import type { TempVcUtility } from "#src/modules/tempvc/utilities/TempVcUtility.js";

interface ResolvedVc {
  channel: VoiceBasedChannel;
  record: VcRecord;
}

interface NotFoundErrors {
  channel: { identifier: string; message: string };
  record: { identifier: string; message: string };
}

export async function resolveVc(
  guild: Guild | null | undefined,
  guildId: string,
  channelId: string,
  notFound?: NotFoundErrors,
): Promise<ResolvedVc | null> {
  const channel = guild?.channels.cache.get(channelId);
  if (!channel || !channel.isVoiceBased()) {
    if (notFound) throw new UserError(notFound.channel);
    return null;
  }

  const record = await getVcRecord(container, guildId, channelId);
  if (!record) {
    if (notFound) throw new UserError(notFound.channel);
    return null;
  }

  return { channel, record };
}

export async function resolveOwnedVc(
  guild: Guild | null | undefined,
  guildId: string,
  channelId: string,
  service: TempVcUtility,
  member: GuildMember,
  t?: LumiT,
  notFound?: NotFoundErrors,
): Promise<ResolvedVc | null> {
  const resolved = await resolveVc(guild, guildId, channelId, notFound);
  if (!resolved) return null;
  assertOwner(service, member, resolved.channel, resolved.record.ownerId, t);
  return resolved;
}

export async function resolveOwnedRecord(
  guildId: string,
  channelId: string,
  channel: VoiceBasedChannel,
  service: TempVcUtility,
  member: GuildMember,
  t?: LumiT,
): Promise<VcRecord | null> {
  const record = await getVcRecord(container, guildId, channelId);
  if (!record) return null;
  assertOwner(service, member, channel, record.ownerId, t);
  return record;
}
