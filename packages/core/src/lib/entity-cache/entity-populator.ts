import { container } from "@sapphire/framework";
import type {
  GatewayDispatchPayload,
  APIChannel,
  APIRole,
  APIGuild,
  APIGuildMember,
  APIUser,
} from "discord-api-types/v10";
import type { RedisEntityCache } from "./RedisEntityCache.js";

export function installEntityPopulator(cache: RedisEntityCache): () => void {
  const client = container.client as unknown as {
    on(event: string, l: (data: GatewayDispatchPayload) => void): unknown;
    off(event: string, l: (data: GatewayDispatchPayload) => void): unknown;
  };

  const onDispatch = (data: GatewayDispatchPayload): void => {
    void handle(cache, data).catch((err) =>
      container.logger.warn(
        `[EntityPopulator] ${data.t ?? "?"} failed: ${String(err)}`,
      ),
    );
  };
  client.on("raw", onDispatch);
  return () => client.off("raw", onDispatch);
}

async function handle(
  cache: RedisEntityCache,
  data: GatewayDispatchPayload,
): Promise<void> {
  const { t } = data;
  const now = Date.now();
  switch (t) {
    case "GUILD_CREATE":
    case "GUILD_UPDATE": {
      const g = data.d as APIGuild;
      await cache.putGuild({
        id: g.id,
        name: g.name,
        ownerId: g.owner_id,
        locale: g.preferred_locale,
        cachedAt: now,
      });
      if (t === "GUILD_CREATE") {
        const gc = data.d as APIGuild & {
          channels?: APIChannel[];
          roles?: APIRole[];
          members?: APIGuildMember[];
        };
        if (Array.isArray(gc.channels)) {
          for (const c of gc.channels) {
            await cache.putChannel({
              id: c.id,
              guildId: g.id,
              name: ("name" in c && c.name) || "",
              type: c.type,
              parentId: ("parent_id" in c && c.parent_id) || undefined,
              cachedAt: now,
            });
          }
        }
        if (Array.isArray(gc.roles)) {
          for (const r of gc.roles) {
            await cache.putRole({
              id: r.id,
              guildId: g.id,
              name: r.name,
              permissions: r.permissions,
              position: r.position,
              cachedAt: now,
            });
          }
        }
      }
      return;
    }
    case "GUILD_DELETE": {
      const d = data.d as { id: string; unavailable?: boolean };
      if (!d.unavailable) await cache.deleteGuild(d.id);
      return;
    }
    case "CHANNEL_CREATE":
    case "CHANNEL_UPDATE": {
      const c = data.d as APIChannel & { guild_id?: string };
      if (!c.guild_id) return;
      await cache.putChannel({
        id: c.id,
        guildId: c.guild_id,
        name: ("name" in c && c.name) || "",
        type: c.type,
        parentId: ("parent_id" in c && c.parent_id) || undefined,
        cachedAt: now,
      });
      return;
    }
    case "CHANNEL_DELETE": {
      const c = data.d as { id: string };
      await cache.deleteChannel(c.id);
      return;
    }
    case "GUILD_ROLE_CREATE":
    case "GUILD_ROLE_UPDATE": {
      const p = data.d as { guild_id: string; role: APIRole };
      await cache.putRole({
        id: p.role.id,
        guildId: p.guild_id,
        name: p.role.name,
        permissions: p.role.permissions,
        position: p.role.position,
        cachedAt: now,
      });
      return;
    }
    case "GUILD_ROLE_DELETE": {
      const p = data.d as { guild_id: string; role_id: string };
      await cache.deleteRole(p.role_id);
      return;
    }
    case "GUILD_MEMBER_ADD":
    case "GUILD_MEMBER_UPDATE": {
      const m = data.d as APIGuildMember & { guild_id: string };
      if (!m.user?.id) return;
      await cache.putMember({
        userId: m.user.id,
        guildId: m.guild_id,
        roleIds: m.roles ?? [],
        nick: m.nick ?? undefined,
        cachedAt: now,
      });
      await cache.putUser({
        id: m.user.id,
        username: m.user.username,
        discriminator: m.user.discriminator,
        bot: m.user.bot,
        cachedAt: now,
      });
      return;
    }
    case "GUILD_MEMBER_REMOVE": {
      const p = data.d as { guild_id: string; user: APIUser };
      await cache.deleteMember(p.guild_id, p.user.id);
      return;
    }
    case "USER_UPDATE": {
      const u = data.d as APIUser;
      await cache.putUser({
        id: u.id,
        username: u.username,
        discriminator: u.discriminator,
        bot: u.bot,
        cachedAt: now,
      });
    }
  }
}
