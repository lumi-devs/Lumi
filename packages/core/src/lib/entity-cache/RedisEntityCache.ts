import type { Redis } from "ioredis";
import { RedisKeys, RedisTTL } from "#lib/database/redis.js";

export interface CachedGuild {
  id: string;
  name: string;
  ownerId: string;
  /** Discord guild "preferred locale" - used by some moderation card flows. */
  locale?: string;
  /** ISO timestamp of the last write into the cache. */
  cachedAt: number;
}

export interface CachedChannel {
  id: string;
  guildId: string;
  name: string;
  /** discord-api-types ChannelType numeric. */
  type: number;
  parentId?: string;
  cachedAt: number;
}

export interface CachedRole {
  id: string;
  guildId: string;
  name: string;
  /** Permission bits as a decimal string (snowflake-safe). */
  permissions: string;
  position: number;
  cachedAt: number;
}

export interface CachedUser {
  id: string;
  username: string;
  discriminator?: string;
  bot?: boolean;
  cachedAt: number;
}

export interface CachedMember {
  userId: string;
  guildId: string;
  /** Role ids - comma-joined in the hash field to dodge ioredis list quirks. */
  roleIds: string[];
  /** Server-side nickname, if set. */
  nick?: string;
  cachedAt: number;
}

const channelFields = (c: CachedChannel): Record<string, string> => ({
  id: c.id,
  guildId: c.guildId,
  name: c.name,
  type: String(c.type),
  ...(c.parentId ? { parentId: c.parentId } : {}),
  cachedAt: String(c.cachedAt),
});

const roleFields = (r: CachedRole): Record<string, string> => ({
  id: r.id,
  guildId: r.guildId,
  name: r.name,
  permissions: r.permissions,
  position: String(r.position),
  cachedAt: String(r.cachedAt),
});

export class RedisEntityCache {
  public constructor(private readonly redis: Redis) {}

  public async guild(id: string): Promise<CachedGuild | null> {
    const h = await this.redis.hgetall(RedisKeys.entityGuild(id));
    if (!h.id) return null;
    return {
      id: h.id,
      name: h.name ?? "",
      ownerId: h.ownerId ?? "",
      locale: h.locale || undefined,
      cachedAt: Number(h.cachedAt) || 0,
    };
  }

  public async putGuild(g: CachedGuild): Promise<void> {
    await this.#putHash(RedisKeys.entityGuild(g.id), {
      id: g.id,
      name: g.name,
      ownerId: g.ownerId,
      ...(g.locale ? { locale: g.locale } : {}),
      cachedAt: String(g.cachedAt),
    });
  }

  public async deleteGuild(id: string): Promise<void> {
    await this.redis.del(RedisKeys.entityGuild(id));
  }

  public async channel(id: string): Promise<CachedChannel | null> {
    const h = await this.redis.hgetall(RedisKeys.entityChannel(id));
    if (!h.id) return null;
    return {
      id: h.id,
      guildId: h.guildId ?? "",
      name: h.name ?? "",
      type: Number(h.type) || 0,
      parentId: h.parentId || undefined,
      cachedAt: Number(h.cachedAt) || 0,
    };
  }

  public async putChannel(c: CachedChannel): Promise<void> {
    await this.#putHash(RedisKeys.entityChannel(c.id), channelFields(c));
  }

  public async putChannels(channels: readonly CachedChannel[]): Promise<void> {
    if (channels.length === 0) return;
    const pipe = this.redis.pipeline();
    for (const c of channels) {
      const key = RedisKeys.entityChannel(c.id);
      pipe.hmset(key, channelFields(c)).expire(key, RedisTTL.entity);
    }
    await pipe.exec();
  }

  public async deleteChannel(id: string): Promise<void> {
    await this.redis.del(RedisKeys.entityChannel(id));
  }

  public async role(id: string): Promise<CachedRole | null> {
    const h = await this.redis.hgetall(RedisKeys.entityRole(id));
    if (!h.id) return null;
    return {
      id: h.id,
      guildId: h.guildId ?? "",
      name: h.name ?? "",
      permissions: h.permissions ?? "0",
      position: Number(h.position) || 0,
      cachedAt: Number(h.cachedAt) || 0,
    };
  }

  public async putRole(r: CachedRole): Promise<void> {
    await this.#putHash(RedisKeys.entityRole(r.id), roleFields(r));
  }

  public async putRoles(roles: readonly CachedRole[]): Promise<void> {
    if (roles.length === 0) return;
    const pipe = this.redis.pipeline();
    for (const r of roles) {
      const key = RedisKeys.entityRole(r.id);
      pipe.hmset(key, roleFields(r)).expire(key, RedisTTL.entity);
    }
    await pipe.exec();
  }

  public async deleteRole(id: string): Promise<void> {
    await this.redis.del(RedisKeys.entityRole(id));
  }

  public async user(id: string): Promise<CachedUser | null> {
    const h = await this.redis.hgetall(RedisKeys.entityUser(id));
    if (!h.id) return null;
    return {
      id: h.id,
      username: h.username ?? "",
      discriminator: h.discriminator || undefined,
      bot: h.bot === "1",
      cachedAt: Number(h.cachedAt) || 0,
    };
  }

  public async putUser(u: CachedUser): Promise<void> {
    await this.#putHash(RedisKeys.entityUser(u.id), {
      id: u.id,
      username: u.username,
      ...(u.discriminator ? { discriminator: u.discriminator } : {}),
      ...(u.bot ? { bot: "1" } : {}),
      cachedAt: String(u.cachedAt),
    });
  }

  public async member(
    guildId: string,
    userId: string,
  ): Promise<CachedMember | null> {
    const h = await this.redis.hgetall(RedisKeys.entityMember(guildId, userId));
    if (!h.userId) return null;
    return {
      userId: h.userId,
      guildId: h.guildId ?? guildId,
      roleIds: h.roleIds
        ? h.roleIds.split(",").filter((id) => id.length > 0)
        : [],
      nick: h.nick || undefined,
      cachedAt: Number(h.cachedAt) || 0,
    };
  }

  public async putMember(m: CachedMember): Promise<void> {
    await this.#putHash(RedisKeys.entityMember(m.guildId, m.userId), {
      userId: m.userId,
      guildId: m.guildId,
      roleIds: m.roleIds.join(","),
      ...(m.nick ? { nick: m.nick } : {}),
      cachedAt: String(m.cachedAt),
    });
  }

  public async deleteMember(guildId: string, userId: string): Promise<void> {
    await this.redis.del(RedisKeys.entityMember(guildId, userId));
  }

  /** Write a hash projection and (re)apply the shared entity TTL atomically. */
  #putHash(key: string, fields: Record<string, string>): Promise<unknown> {
    return this.redis
      .multi()
      .hmset(key, fields)
      .expire(key, RedisTTL.entity)
      .exec();
  }
}
