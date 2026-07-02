import { container } from "@sapphire/framework";
import type { Guild } from "@prisma/client";
import type { DatabaseClient } from "#database/client.js";
import type { Redis } from "ioredis";
import { RedisKeys } from "#database/redis.js";
import { acquireRedisLock } from "#core/lib/redis-lock.js";

// Redis-backed locks: mutual exclusion across N stateless workers, not the
// per-process AsyncQueue used previously. Lock keys live under `lumi:lock:*`
// so they're easy to inspect (`KEYS lumi:lock:*`) and never collide with
// cache keys.

const GUILD_LOCK = (guildId: string) => `lumi:lock:guild:${guildId}`;
const CONFIG_LOCK = (guildId: string, moduleName: string) =>
  `lumi:lock:cfg:${moduleName}:${guildId}`;

export async function configLock(
  guildId: string,
  moduleName: string,
): Promise<() => void> {
  const release = await acquireRedisLock(
    container.redis,
    CONFIG_LOCK(guildId, moduleName),
    { ttlMs: 10_000, acquireTimeoutMs: 20_000 },
  );
  // Fire-and-forget the async release so call sites that expect a sync
  // releaser still work; errors are swallowed in the helper.
  return () => {
    void release();
  };
}

export class GuildWriteTransaction {
  #changes: Partial<Guild> = {};
  #hasChanges = false;
  #locking = true;

  public constructor(
    public readonly settings: Readonly<Guild>,
    private readonly release: () => Promise<void>,
    private readonly guildId: string,
    private readonly prisma: DatabaseClient,
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
    if (!this.#hasChanges) {
      await this.#release();
      return;
    }

    try {
      await this.prisma.guild.update({
        where: { id: this.guildId },
        data: this.#changes,
      });

      const keysToInvalidate = [RedisKeys.guildSettings(this.guildId)];
      if ("prefix" in this.#changes)
        keysToInvalidate.push(RedisKeys.guildPrefixes(this.guildId));
      // Use the InvalidationBus (delete + broadcast) so peer processes drop
      // their cached copies too — a raw redis.del only evicts locally.
      await container.invalidation.invalidate(...keysToInvalidate);

      this.#hasChanges = false;
    } finally {
      await this.#release();
    }
  }

  public dispose() {
    void this.#release();
  }

  /** TC39 `using` keyword support — releases the lock automatically on scope exit. */
  public [Symbol.dispose](): void {
    void this.#release();
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
  redis: Redis,
  prisma: DatabaseClient,
): Promise<GuildWriteTransaction> {
  const release = await acquireRedisLock(redis, GUILD_LOCK(guildId), {
    ttlMs: 15_000,
    acquireTimeoutMs: 30_000,
  });

  try {
    let settings = await prisma.guild.findUnique({ where: { id: guildId } });
    if (!settings) {
      settings = await prisma.guild.create({ data: { id: guildId } });
    }

    return new GuildWriteTransaction(settings, release, guildId, prisma);
  } catch (err) {
    await release();
    throw err;
  }
}
