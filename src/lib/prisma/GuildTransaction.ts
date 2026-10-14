import type { Guild } from "@prisma/client";
import type { DatabaseClient } from "#src/lib/prisma/Client.js";
import { acquireLock, type Lock } from "#src/lib/cache/Lock.js";
import { cacheStore } from "#src/lib/cache/CacheStore.js";
import { CacheKeys } from "#src/lib/cache/Keys.js";

const GuildLockKey = (guildId: string) => `lock:guild:${guildId}`;

export async function configLock(guildId: string): Promise<() => void> {
  const lock = await acquireLock(GuildLockKey(guildId));
  return () => {
    lock.release();
  };
}

export class GuildWriteTransaction {
  #changes: Partial<Guild> = {};
  #hasChanges = false;
  #used = false;

  public constructor(
    public readonly settings: Readonly<Guild>,
    private readonly lock: Lock,
    private readonly guildId: string,
    private readonly prisma: DatabaseClient,
  ) {}

  public get hasChanges() {
    return this.#hasChanges;
  }

  public write(data: Partial<Guild>): this {
    Object.assign(this.#changes, data);
    this.#hasChanges = true;
    return this;
  }

  public async submit(): Promise<void> {
    if (this.#used) {
      throw new Error(`GuildWriteTransaction for guild ${this.guildId} was already submitted`);
    }
    this.#used = true;

    try {
      if (this.#hasChanges) {
        await this.prisma.guild.update({
          where: { id: this.guildId },
          data: this.#changes,
        });
        cacheStore.delete(CacheKeys.guildSettings(this.guildId));
      }
    } finally {
      this.lock.release();
    }
  }

  public rollback(): void {
    if (!this.#used) {
      this.#used = true;
      this.lock.release();
    }
  }
}

export async function createGuildTransaction(
  guildId: string,
  prisma: DatabaseClient,
): Promise<GuildWriteTransaction> {
  const lock = await acquireLock(GuildLockKey(guildId));
  try {
    const settings = await prisma.guild.findUnique({ where: { id: guildId } });
    if (!settings) {
      lock.release();
      throw new Error(`Guild not found: ${guildId}`);
    }
    return new GuildWriteTransaction(settings, lock, guildId, prisma);
  } catch (err) {
    lock.release();
    throw err;
  }
}
