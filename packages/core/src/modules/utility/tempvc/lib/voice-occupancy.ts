// Redis-backed voice channel occupancy tracker for tempvc. tempvc-cleanup runs on a
// worker where the discord.js voice-state cache is disabled (VoiceStateManager: 0 in
// EmberClient), so neither `channel.members.size` nor `oldState.channelId` is reliable;
// we maintain the projection ourselves from raw VOICE_STATE_UPDATE dispatches (one user
// per event) plus the voice_states array on GUILD_CREATE (boot seed). It's a SET of
// user ids per channel plus a reverse user→channel pointer, so raw events (which carry
// only the new channel) can find what to SREM from.

import { container } from "@sapphire/framework";

const TTL_SECONDS = 24 * 60 * 60;

const occKey = (channelId: string) => `ember:tempvc:voice:occ:${channelId}`;
const userKey = (userId: string) => `ember:tempvc:voice:user:${userId}`;

/** Move `userId` from their previous channel to `newChannelId` (null = disconnected). */
export async function trackVoiceState(
  userId: string,
  newChannelId: string | null,
): Promise<{ prevChannelId: string | null }> {
  const { redis } = container;
  const prev = await redis.get(userKey(userId));
  if (prev === newChannelId) return { prevChannelId: prev };

  const pipe = redis.multi();
  if (prev) pipe.srem(occKey(prev), userId);
  if (newChannelId) {
    pipe.sadd(occKey(newChannelId), userId);
    pipe.expire(occKey(newChannelId), TTL_SECONDS);
    pipe.set(userKey(userId), newChannelId, "EX", TTL_SECONDS);
  } else {
    pipe.del(userKey(userId));
  }
  await pipe.exec();
  return { prevChannelId: prev };
}

export async function isVoiceChannelEmpty(channelId: string): Promise<boolean> {
  const n = await container.redis.scard(occKey(channelId));
  return n === 0;
}

export async function clearVoiceChannelOccupancy(
  channelId: string,
): Promise<void> {
  await container.redis.del(occKey(channelId));
}

/** Bulk-load occupancy from a GUILD_CREATE voice_states array. */
export async function seedVoiceStates(
  voiceStates: ReadonlyArray<{
    user_id: string;
    channel_id: string | null;
  }>,
): Promise<void> {
  if (voiceStates.length === 0) return;
  const { redis } = container;
  const pipe = redis.multi();
  for (const v of voiceStates) {
    if (!v.channel_id) continue;
    pipe.sadd(occKey(v.channel_id), v.user_id);
    pipe.expire(occKey(v.channel_id), TTL_SECONDS);
    pipe.set(userKey(v.user_id), v.channel_id, "EX", TTL_SECONDS);
  }
  await pipe.exec();
}
