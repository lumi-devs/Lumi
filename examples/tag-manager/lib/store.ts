import { container } from "@sapphire/framework";

// Addons can't ship Prisma migrations, so persistence goes through the
// generic guildKV store: keyed by guildId + module + targetId + key.
// The identifier that varies per record (the tag name) goes in `targetId`;
// `key` just names the collection so listModuleData can filter on it.
const MODULE = "tag-manager";
const KEY = "tag";

export interface TagRecord {
  response: string;
  createdBy: string;
  createdAt: number;
}

export async function getTag(guildId: string, name: string): Promise<TagRecord | null> {
  return container.db.guildKV.getModuleData<TagRecord>(guildId, MODULE, name, KEY);
}

export async function setTag(guildId: string, name: string, record: TagRecord): Promise<void> {
  await container.db.guildKV.setModuleData(guildId, MODULE, name, KEY, record);
}

export async function deleteTag(guildId: string, name: string): Promise<boolean> {
  const deleted = await container.db.guildKV.deleteModuleData(guildId, MODULE, name, KEY);
  return deleted > 0;
}

export async function listTags(guildId: string): Promise<Array<{ name: string; record: TagRecord }>> {
  const rows = await container.db.guildKV.listModuleData<TagRecord>({ module: MODULE, key: KEY, guildId });
  return rows.map((row) => ({ name: row.targetId, record: row.value }));
}

export async function resetTags(guildId: string): Promise<number> {
  const tags = await listTags(guildId);
  let deleted = 0;
  for (const tag of tags) {
    if (await deleteTag(guildId, tag.name)) deleted++;
  }
  return deleted;
}
