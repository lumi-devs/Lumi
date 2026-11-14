import { container } from "@lib/Services.js";
import type {RedisClient} from "@redis/Cluster.js";
import type { Guild } from "@prisma/client";
import type { DatabaseClient } from "@db/Client.js";
import {acquireRedisLock, verifyRedisLock} from "@redis/Lock.js";

const GuildLock = (guildId: string) => `lumi:lock:guild:${guildId}`;

export async function configLock(guildId: string): Promise<() => void> {
  const { release } = await acquireRedisLock(container.redis, GuildLock(guildId), {
    ttlMs: 10_000,
    acquireTimeoutMs: 20_000,
  });
  return () => {
    void release();
  };
}

export class GuildWriteTransaction {
  #changes: Partial<Guild> = {};
  #hasChanges = false;
  #locking = true;
  #used = false;

  public constructor(
    public readonly settings: Readonly<Guild>,
    private readonly release: () => Promise<void>,
    private readonly guildId: string,
    private readonly prisma: DatabaseClient,
    private readonly redis: RedisClient,
    private readonly lockToken: string,
  ) {}

  public get locking() {
    return this.#locking;
  }

  public write(data: Partial<Guild>): this {
    Object.assign(this.#changes, data);
    this.#hasChanges = true;
    return this;
  }

  public async submit(): Promise<void> {
    if (this.#used) {
      throw new Error(
        `GuildWriteTransaction for guild ${this.guildId} was already submitted; create a new transaction instead of reusing this one`,
      );
    }
    this.#used = true;

    if (!this.#hasChanges) {
      await this.#release();
      return;
    }

    try {
      const key = GuildLock(this.guildId);
      const stillHeld = await verifyRedisLock(this.redis, key, this.lockToken);
      if (!stillHeld) {
        throw new Error(
          `Lock lost before write for guild ${this.guildId}; refusing to write unlocked`,
        );
      }

      await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT 1 FROM "guilds" WHERE "guild_id" = ${this.guildId} FOR UPDATE`;
        await tx.guild.update({
          where: { id: this.guildId },
          data: this.#changes,
        });
      });

      await container.db.config.invalidateGuildSettings(this.guildId);

      this.#hasChanges = false;
    } finally {
      await this.#release();
    }
  }

  public dispose() {
    this.#releaseQuietly();
  }

  #releaseQuietly(): void {
    this.#release().catch((err: unknown) =>
      container.logger.error("[GuildWriteTransaction] release failed", err),
    );
  }

  async #release() {
    if (this.#locking) {
      this.#locking = false;
      await this.release();
    }
  }
}

export async function createGuildTransaction(
  guildId: string,
  redis: RedisClient,
  prisma: DatabaseClient,
): Promise<GuildWriteTransaction> {
  const { release, token } = await acquireRedisLock(redis, GuildLock(guildId), {
    ttlMs: 15_000,
    acquireTimeoutMs: 30_000,
  });

  try {
    let settings = await prisma.guild.findUnique({ where: { id: guildId } });
    if (!settings) {
      settings = await prisma.guild.create({ data: { id: guildId } });
    }

    return new GuildWriteTransaction(settings, release, guildId, prisma, redis, token);
  } catch (err) {
    await release();
    throw err;
  }
}
