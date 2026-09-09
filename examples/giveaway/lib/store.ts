import { randomUUID } from "node:crypto";
import * as kv from "lumi/kv";
import * as redis from "lumi/redis";

const KEY = "giveaway";

// Entry sets are ephemeral and high-churn (one SADD per click), so they live
// in Redis; the giveaway's durable metadata goes to KV.
const entriesKey = (guildId: string, giveawayId: string) => `${guildId}:${giveawayId}:entries`;

export interface GiveawayRecord {
  channelId: string;
  messageId: string;
  prize: string;
  winnerCount: number;
  hostId: string;
  createdAt: number;
  endsAt: number;
  endedAt?: number;
  winners?: string[];
}

export interface StartParams {
  guildId: string;
  channelId: string;
  messageId: string;
  prize: string;
  winnerCount: number;
  hostId: string;
  durationMs: number;
}

export async function getGiveaway(guildId: string, id: string): Promise<GiveawayRecord | null> {
  return kv.get<GiveawayRecord>(guildId, id, KEY);
}

export async function updateGiveaway(
  guildId: string,
  id: string,
  patch: Partial<GiveawayRecord>,
): Promise<GiveawayRecord | null> {
  const existing = await getGiveaway(guildId, id);
  if (!existing) return null;
  const updated = { ...existing, ...patch };
  await kv.set(guildId, id, KEY, updated);
  return updated;
}

export async function startGiveaway(
  params: StartParams,
): Promise<{ id: string; record: GiveawayRecord }> {
  const id = randomUUID();
  const record: GiveawayRecord = {
    channelId: params.channelId,
    messageId: params.messageId,
    prize: params.prize,
    winnerCount: params.winnerCount,
    hostId: params.hostId,
    createdAt: Date.now(),
    endsAt: Date.now() + params.durationMs,
  };
  await kv.set(params.guildId, id, KEY, record);
  return { id, record };
}

export async function enterGiveaway(
  guildId: string,
  giveawayId: string,
  userId: string,
): Promise<number> {
  const key = entriesKey(guildId, giveawayId);
  await redis.sadd(key, userId);
  return redis.scard(key);
}

export async function pickWinners(
  guildId: string,
  giveawayId: string,
  count: number,
): Promise<string[]> {
  const entrants = await redis.smembers(entriesKey(guildId, giveawayId));
  return [...entrants].sort(() => Math.random() - 0.5).slice(0, count);
}

export async function endGiveaway(
  guildId: string,
  giveawayId: string,
): Promise<GiveawayRecord | null> {
  const record = await getGiveaway(guildId, giveawayId);
  if (!record) return null;
  const winners = await pickWinners(guildId, giveawayId, record.winnerCount);
  return updateGiveaway(guildId, giveawayId, { endedAt: Date.now(), winners });
}
