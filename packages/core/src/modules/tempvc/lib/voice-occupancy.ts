import { container } from "@sapphire/framework";
import { pipelineBySlot } from "#lib/database/cluster-safe.js";

const TTL_SECONDS = 24 * 60 * 60;

const OCC_PREFIX = "lumi:tempvc:voice:occ:";
const occKey = (channelId: string) => `${OCC_PREFIX}${channelId}`;
const userKey = (userId: string) => `lumi:tempvc:voice:user:${userId}`;

/**
 * Read-the-previous-channel and rewrite occupancy in one Lua call: two voice
 * events for the same user (join then move) are handled concurrently, and a
 * GET followed by a separate MULTI lets the second event read a pre-move value
 * and skip the SREM - leaving the user forever "in" a temp VC that then never
 * qualifies as empty for cleanup.
 */
const TRACK_SCRIPT = `
local prev = redis.call('GET', KEYS[1])
if prev == false then prev = nil end
local newChannel = ARGV[1]
if newChannel == '' then newChannel = nil end
if prev == newChannel then return prev or false end
if prev then redis.call('SREM', ARGV[4] .. prev, ARGV[2]) end
if newChannel then
  local occ = ARGV[4] .. newChannel
  redis.call('SADD', occ, ARGV[2])
  redis.call('EXPIRE', occ, ARGV[3])
  redis.call('SET', KEYS[1], newChannel, 'EX', ARGV[3])
else
  redis.call('DEL', KEYS[1])
end
return prev or false
`;

/** Move `userId` from their previous channel to `newChannelId` (null = disconnected). */
export async function trackVoiceState(
  userId: string,
  newChannelId: string | null,
): Promise<{ prevChannelId: string | null }> {
  const prev = (await container.redis.eval(
    TRACK_SCRIPT,
    1,
    userKey(userId),
    newChannelId ?? "",
    userId,
    String(TTL_SECONDS),
    OCC_PREFIX,
  )) as string | null;
  return { prevChannelId: prev ?? null };
}

export async function isVoiceChannelEmpty(channelId: string): Promise<boolean> {
  const n = await container.redis.scard(occKey(channelId));
  return n === 0;
}

export async function clearVoiceChannelOccupancy(
  channelId: string,
): Promise<void> {
  await container.invalidation.invalidate(occKey(channelId));
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
  // Each voice state writes an occupancy-set key and a user key that hash to
  // different slots, so the writes are flattened per key rather than issued as
  // one transaction.
  type Write =
    | { key: string; kind: "occupancy"; channelId: string; userId: string }
    | { key: string; kind: "user"; channelId: string; userId: string };

  const writes: Write[] = [];
  for (const v of voiceStates) {
    if (!v.channel_id) continue;
    writes.push({
      key: occKey(v.channel_id),
      kind: "occupancy",
      channelId: v.channel_id,
      userId: v.user_id,
    });
    writes.push({
      key: userKey(v.user_id),
      kind: "user",
      channelId: v.channel_id,
      userId: v.user_id,
    });
  }

  await pipelineBySlot(
    redis,
    writes,
    (w) => w.key,
    (pipe, w) => {
      if (w.kind === "occupancy") {
        pipe.sadd(w.key, w.userId).expire(w.key, TTL_SECONDS);
      } else {
        pipe.set(w.key, w.channelId, "EX", TTL_SECONDS);
      }
    },
  );
}
