import { container } from "@sapphire/framework";

const MODULE = "giveaway";
const KEY = "giveaway";

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

export async function createGiveaway(guildId: string, id: string, record: GiveawayRecord): Promise<void> {
  await container.db.guildKV.setModuleData(guildId, MODULE, id, KEY, record);
}

export async function getGiveaway(guildId: string, id: string): Promise<GiveawayRecord | null> {
  return container.db.guildKV.getModuleData<GiveawayRecord>(guildId, MODULE, id, KEY);
}

export async function updateGiveaway(
  guildId: string,
  id: string,
  patch: Partial<GiveawayRecord>,
): Promise<GiveawayRecord | null> {
  const existing = await getGiveaway(guildId, id);
  if (!existing) return null;
  const updated = { ...existing, ...patch };
  await container.db.guildKV.setModuleData(guildId, MODULE, id, KEY, updated);
  return updated;
}

export async function listActiveGiveaways(guildId: string): Promise<Array<{ id: string; record: GiveawayRecord }>> {
  const rows = await container.db.guildKV.listModuleData<GiveawayRecord>({ module: MODULE, key: KEY, guildId });
  return rows.filter((row) => !row.value.endedAt).map((row) => ({ id: row.targetId, record: row.value }));
}
