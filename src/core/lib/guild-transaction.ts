import type { Guild, PrismaClient } from "@prisma/client";
import { AsyncQueue } from "@sapphire/async-queue";
import type { Redis } from "ioredis";
import { RedisKeys } from "#database/redis.js";

const locks = new Map<string, AsyncQueue>();

export class GuildWriteTransaction {
  private _changes: Partial<Guild> = {};
  private _hasChanges = false;
  private _locking = true;

  public constructor(
    public readonly settings: Readonly<Guild>,
    private readonly queue: AsyncQueue,
    private readonly guildId: string,
    private readonly redis: Redis,
    private readonly prisma: PrismaClient,
  ) {}

  public get hasChanges() {
    return this._hasChanges;
  }

  public get locking() {
    return this._locking;
  }

  public write(data: Partial<Guild>): this {
    Object.assign(this._changes, data);
    this._hasChanges = true;
    return this;
  }

  public async submit(): Promise<void> {
    if (!this._hasChanges) {
      this._release();
      return;
    }

    try {
      await this.prisma.guild.update({
        where: { id: this.guildId },
        data: this._changes,
      });

      this._hasChanges = false;

      await this.redis.del(RedisKeys.guildSettings(this.guildId));
      if ("prefix" in this._changes) {
        await this.redis.del(RedisKeys.guildPrefixes(this.guildId));
      }
    } finally {
      this._release();
    }
  }

  public dispose() {
    this._release();
  }

  private _release() {
    if (this._locking) {
      this.queue.shift();
      this._locking = false;
    }
  }
}

export async function createGuildTransaction(
  guildId: string,
  redis: Redis,
  prisma: PrismaClient,
): Promise<GuildWriteTransaction> {
  let queue = locks.get(guildId);
  if (!queue) {
    queue = new AsyncQueue();
    locks.set(guildId, queue);
  }

  await queue.wait();

  try {
    let settings = await prisma.guild.findUnique({ where: { id: guildId } });
    if (!settings) {
      settings = await prisma.guild.create({ data: { id: guildId } });
    }

    return new GuildWriteTransaction(settings, queue, guildId, redis, prisma);
  } catch (err) {
    queue.shift();
    throw err;
  }
}
