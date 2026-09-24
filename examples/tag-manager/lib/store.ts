import * as kv from "lumi/kv";

// Addons can't ship Prisma migrations, so persistence goes through the
// generic per-guild KV store, namespaced to this addon by the host. The
// identifier that varies per record (the tag name) goes in `targetId`;
// `key` just names the collection so `list` can filter on it.
const KEY = "tag";

export interface TagRecord {
  response: string;
  createdBy: string;
  createdAt: number;
}

export async function getTag(guildId: string, name: string): Promise<TagRecord | null> {
  return kv.get<TagRecord>(guildId, name, KEY);
}

export async function setTag(guildId: string, name: string, record: TagRecord): Promise<void> {
  await kv.set(guildId, name, KEY, record);
}

export async function deleteTag(guildId: string, name: string): Promise<boolean> {
  return (await kv.remove(guildId, name, KEY)) > 0;
}

export async function listTags(guildId: string): Promise<Array<{ name: string; record: TagRecord }>> {
  const rows = await kv.list<TagRecord>(KEY, guildId);
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
