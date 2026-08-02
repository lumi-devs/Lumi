import { randomUUID } from "node:crypto";
import { ApplyOptions } from "@sapphire/decorators";
import type { Piece } from "@sapphire/framework";
import { Service } from "lumi";
import { GiveawayKeys } from "../keys.js";
import { createGiveaway, getGiveaway, updateGiveaway, type GiveawayRecord } from "../lib/store.js";

interface StartParams {
  guildId: string;
  channelId: string;
  messageId: string;
  prize: string;
  winnerCount: number;
  hostId: string;
  durationMs: number;
}

@ApplyOptions<Piece.Options>({ name: "giveaway" })
export default class GiveawayService extends Service {
  public async start(params: StartParams): Promise<{ id: string; record: GiveawayRecord }> {
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
    await createGiveaway(params.guildId, id, record);
    return { id, record };
  }

  public async enter(guildId: string, giveawayId: string, userId: string): Promise<number> {
    const key = GiveawayKeys.entries(guildId, giveawayId);
    await this.redis.sadd(key, userId);
    return this.redis.scard(key);
  }

  public async removeEntrant(guildId: string, giveawayId: string, userId: string): Promise<void> {
    await this.redis.srem(GiveawayKeys.entries(guildId, giveawayId), userId);
  }

  public async pickWinners(guildId: string, giveawayId: string, count: number): Promise<string[]> {
    const entrants = await this.redis.smembers(GiveawayKeys.entries(guildId, giveawayId));
    const shuffled = [...entrants].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
  }

  public async end(guildId: string, giveawayId: string): Promise<GiveawayRecord | null> {
    const record = await getGiveaway(guildId, giveawayId);
    if (!record) return null;

    const winners = await this.pickWinners(guildId, giveawayId, record.winnerCount);
    return updateGiveaway(guildId, giveawayId, { endedAt: Date.now(), winners });
  }
}

declare module "lumi" {
  interface Services {
    giveaway: GiveawayService;
  }
}
