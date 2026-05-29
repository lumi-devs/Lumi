// S8 slice 3: Redis-backed entity cache.
//
// Why exist: at horizontal-scale, every worker process holding its own copy of
// `client.guilds.cache` is the dominant per-worker memory line (~25 KB/guild
// at typical settings). Workers become stateless re: Discord entities by
// reading the projection here on demand instead.
//
// What this is: a *minimal* projection — id, name, owner, parent, permission
// bits, position, type. Everything a permission check / channel resolution
// needs, none of the audit-log metadata / presence / voice-state shadow that
// discord.js keeps. ~256 B/entity is the design budget; 1M guilds fits one
// Redis db.
//
// What this is NOT: a drop-in replacement for `client.guilds.cache.get(id)`.
// The shape is intentionally different so modules can't accidentally lean on
// fields that aren't here. Migration to the new accessor is mechanical but
// not free; see docs/explanation/entity-cache.md.
//
// Population: the worker-side gateway-dispatch listener (entity-populator.ts)
// writes on GUILD_CREATE/UPDATE/DELETE, CHANNEL_*, GUILD_ROLE_*, GUILD_MEMBER_*.
// The cache is cooperative — whichever worker consumes a given event populates
// for the whole fleet; the keys are TTL-bounded against orphan accumulation.

import type { Redis } from "ioredis";
import { RedisKeys, RedisTTL } from "#database/redis.js";

export interface CachedGuild {
  id: string;
  name: string;
  ownerId: string;
  /** Discord guild "preferred locale" — used by some moderation card flows. */
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
  /** Role ids — comma-joined in the hash field to dodge ioredis list quirks. */
  roleIds: string[];
  /** Server-side nickname, if set. */
  nick?: string;
  cachedAt: number;
}

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
    const k = RedisKeys.entityGuild(g.id);
    await this.redis
      .multi()
      .hmset(k, {
        id: g.id,
        name: g.name,
        ownerId: g.ownerId,
        ...(g.locale ? { locale: g.locale } : {}),
        cachedAt: String(g.cachedAt),
      })
      .expire(k, RedisTTL.entity)
      .exec();
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
    const k = RedisKeys.entityChannel(c.id);
    await this.redis
      .multi()
      .hmset(k, {
        id: c.id,
        guildId: c.guildId,
        name: c.name,
        type: String(c.type),
        ...(c.parentId ? { parentId: c.parentId } : {}),
        cachedAt: String(c.cachedAt),
      })
      .expire(k, RedisTTL.entity)
      .exec();
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
    const k = RedisKeys.entityRole(r.id);
    await this.redis
      .multi()
      .hmset(k, {
        id: r.id,
        guildId: r.guildId,
        name: r.name,
        permissions: r.permissions,
        position: String(r.position),
        cachedAt: String(r.cachedAt),
      })
      .expire(k, RedisTTL.entity)
      .exec();
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
    const k = RedisKeys.entityUser(u.id);
    await this.redis
      .multi()
      .hmset(k, {
        id: u.id,
        username: u.username,
        ...(u.discriminator ? { discriminator: u.discriminator } : {}),
        ...(u.bot ? { bot: "1" } : {}),
        cachedAt: String(u.cachedAt),
      })
      .expire(k, RedisTTL.entity)
      .exec();
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
      roleIds: h.roleIds ? h.roleIds.split(",").filter(Boolean) : [],
      nick: h.nick || undefined,
      cachedAt: Number(h.cachedAt) || 0,
    };
  }

  public async putMember(m: CachedMember): Promise<void> {
    const k = RedisKeys.entityMember(m.guildId, m.userId);
    await this.redis
      .multi()
      .hmset(k, {
        userId: m.userId,
        guildId: m.guildId,
        roleIds: m.roleIds.join(","),
        ...(m.nick ? { nick: m.nick } : {}),
        cachedAt: String(m.cachedAt),
      })
      .expire(k, RedisTTL.entity)
      .exec();
  }

  public async deleteMember(guildId: string, userId: string): Promise<void> {
    await this.redis.del(RedisKeys.entityMember(guildId, userId));
  }
}
