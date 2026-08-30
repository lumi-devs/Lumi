import { container } from "@sapphire/framework";
import type { RedisClient } from "#lib/database/cluster-safe.js";
import type { Guild } from "@prisma/client";
import type { DatabaseClient } from "#lib/prisma/client.js";
import { acquireRedisLock, verifyRedisLock } from "#lib/redis-lock.js";

const GUILD_LOCK = (guildId: string) => `lumi:lock:guild:${guildId}`;
const CONFIG_LOCK = (guildId: string, moduleName: string) =>
  `lumi:lock:cfg:${moduleName}:${guildId}`;

export async function configLock(
  guildId: string,
  moduleName: string,
): Promise<() => void> {
  const { release } = await acquireRedisLock(
    container.redis,
    CONFIG_LOCK(guildId, moduleName),
    { ttlMs: 10_000, acquireTimeoutMs: 20_000 },
  );
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

  public get hasChanges() {
    return this.#hasChanges;
  }

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
      const key = GUILD_LOCK(this.guildId);
      const stillHeld = await verifyRedisLock(this.redis, key, this.lockToken);
      if (!stillHeld) {
        throw new Error(
          `Lock lost before write for guild ${this.guildId}; refusing to write unlocked`,
        );
      }

      await this.prisma.guild.update({
        where: { id: this.guildId },
        data: this.#changes,
      });

      await container.db.config.invalidateGuildSettings(
        this.guildId,
        "prefix" in this.#changes,
      );

      this.#hasChanges = false;
    } finally {
      await this.#release();
    }
  }

  public dispose() {
    this.#release().catch((err: unknown) =>
      container.logger.error("[GuildWriteTransaction] release failed", err),
    );
  }

  /** TC39 `using` keyword support - releases the lock automatically on scope exit. */
  public [Symbol.dispose](): void {
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
  const { release, token } = await acquireRedisLock(redis, GUILD_LOCK(guildId), {
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
