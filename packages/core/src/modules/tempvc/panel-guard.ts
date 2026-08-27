import { UserError } from "@sapphire/framework";
import type { Guild, GuildMember, VoiceBasedChannel } from "discord.js";
import type { LumiT } from "#lib/i18n/index.js";
import { getVcRecord, type VcRecord } from "#modules/tempvc/data.js";
import { assertOwner } from "#modules/tempvc/lib/panel-helpers.js";
import type TempVcService from "#modules/tempvc/services/TempVcService.js";

export interface ResolvedVc {
  channel: VoiceBasedChannel;
  record: VcRecord;
}

interface NotFoundErrors {
  channel: { identifier: string; message: string };
  record: { identifier: string; message: string };
}

/**
 * Resolves a panel's target channel and its temp-VC record, in that order.
 * With `notFound` supplied, a missing channel/record throws the matching
 * `UserError` instead of resolving to `null` - used by callers that need to
 * surface a specific reason to the user.
 */
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

  const record = await getVcRecord(guildId, channelId);
  if (!record) {
    if (notFound) throw new UserError(notFound.record);
    return null;
  }

  return { channel, record };
}

/** {@linkcode resolveVc} followed by {@linkcode assertOwner}. */
export async function resolveOwnedVc(
  guild: Guild | null | undefined,
  guildId: string,
  channelId: string,
  service: TempVcService,
  member: GuildMember,
  t?: LumiT,
  notFound?: NotFoundErrors,
): Promise<ResolvedVc | null> {
  const resolved = await resolveVc(guild, guildId, channelId, notFound);
  if (!resolved) return null;
  assertOwner(service, member, resolved.channel, resolved.record.ownerId, t);
  return resolved;
}

/**
 * {@linkcode resolveOwnedVc} for callers that already resolved the channel
 * (and need to keep doing so ahead of an interaction defer).
 */
export async function resolveOwnedRecord(
  guildId: string,
  channelId: string,
  channel: VoiceBasedChannel,
  service: TempVcService,
  member: GuildMember,
  t?: LumiT,
): Promise<VcRecord | null> {
  const record = await getVcRecord(guildId, channelId);
  if (!record) return null;
  assertOwner(service, member, channel, record.ownerId, t);
  return record;
}
