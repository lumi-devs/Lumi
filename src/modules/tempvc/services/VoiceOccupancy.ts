import { container } from "#src/lib/Services.js";
import { pipelineBySlot } from "#src/lib/valkey/Cluster.js";

const TtlSeconds = 24 * 60 * 60;

const OccPrefix = "lumi:tempvc:voice:occ:";
const occKey = (channelId: string) => `${OccPrefix}${channelId}`;
const userKey = (userId: string) => `lumi:tempvc:voice:user:${userId}`;

const TrackScript = `
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

export async function trackVoiceState(
  userId: string,
  newChannelId: string | null,
): Promise<{ prevChannelId: string | null }> {
  const prev = (await container.valkey.eval(
    TrackScript,
    1,
    userKey(userId),
    newChannelId ?? "",
    userId,
    String(TtlSeconds),
    OccPrefix,
  )) as string | null;
  return { prevChannelId: prev ?? null };
}

export async function isVoiceChannelEmpty(channelId: string): Promise<boolean> {
  const n = await container.valkey.scard(occKey(channelId));
  return n === 0;
}

export async function clearVoiceChannelOccupancy(
  channelId: string,
): Promise<void> {
  await container.invalidation.invalidate(occKey(channelId));
}

export async function seedVoiceStates(
  voiceStates: ReadonlyArray<{
    user_id: string;
    channel_id: string | null;
  }>,
): Promise<void> {
  if (voiceStates.length === 0) return;
  const { valkey } = container;

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
    valkey,
    writes,
    (w) => w.key,
    (pipe, w) => {
      if (w.kind === "occupancy") {
        pipe.sadd(w.key, w.userId).expire(w.key, TtlSeconds);
      } else {
        pipe.set(w.key, w.channelId, "EX", TtlSeconds);
      }
    },
  );
}
