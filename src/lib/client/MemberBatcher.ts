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

    const ids = [...new Set(currentBatch.map((b) => b.userId))];
    try {
      const found = new Map<string, GuildMember>();
      for (let i = 0; i < ids.length; i += 100) {
        const members = await guild.members.fetch({ user: ids.slice(i, i + 100) });
        for (const [id, member] of members) found.set(id, member);
      }
      for (const item of currentBatch) {
        item.resolve(found.get(item.userId) ?? null);
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
      const dup = batch.find((b) => b.userId === userId);
      if (dup) {
        const prevResolve = dup.resolve;
        const prevReject = dup.reject;
        dup.resolve = (m) => { prevResolve(m); resolve(m); };
        dup.reject = (e) => { prevReject(e); reject(e); };
      } else {
        batch.push({ userId, resolve, reject });
      }

      if (!timer) {
        timer = setTimeout(flush, windowMs);
        timer.unref?.();
      }
    });
  };
}