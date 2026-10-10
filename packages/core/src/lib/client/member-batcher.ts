import { Guild, GuildMember } from "discord.js";

interface BatchItem {
  userId: string;
  resolve: (member: GuildMember | null) => void;
  reject: (err: Error) => void;
}

export function createMemberBatcher(
  guild: Guild,
  windowMs = 50,
): (userId: string) => Promise<GuildMember | null> {
  let batch: BatchItem[] | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = async () => {
    const currentBatch = batch;
    batch = null;
    timer = null;
    if (!currentBatch || currentBatch.length === 0) return;

    const ids = currentBatch.map((b) => b.userId);
    try {
      const members = await guild.members.fetch({ user: ids });
      const map = members as any;
      for (const item of currentBatch) {
        item.resolve(map.get?.(item.userId) ?? null);
      }
    } catch (err) {
      for (const item of currentBatch) {
        item.reject(err as Error);
      }
    }
  };

  return (userId: string): Promise<GuildMember | null> => {
    return new Promise((resolve, reject) => {
      if (!batch) batch = [];
      batch.push({ userId, resolve, reject });

      if (!timer) {
        timer = setTimeout(flush, windowMs);
      }
    });
  };
}