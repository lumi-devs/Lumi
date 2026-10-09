// boundary, where no threaded services bag crosses today. They read the global
// boot container directly until the IPC scope carries services explicitly.
import { container } from "#lib/services.js";
import { z } from "zod";
import type {
  ChatInputCommandInteraction,
  MessageComponentInteraction,
  ModalSubmitInteraction,
  RepliableInteraction,
} from "discord.js";
import type { AddonRpcRequest } from "@lumi/contracts";
import type { CommandContext, CtxOptionSpec } from "#lib/commands/context.js";
import { ChannelType, MessageFlags, PermissionsBitField } from "discord.js";
import { ephemeralCard, type CardReply } from "#lib/ui/cards.js";
import { sendInteractionReply } from "#lib/utilities/command-response.js";
import { scheduleTask } from "#lib/scheduler/schedule.js";
import { AddonRelayTaskName } from "./relay-task.js";

type MessagePayload = CardReply | { content?: string; components?: unknown[] };

type AddonInteraction = MessageComponentInteraction | ModalSubmitInteraction;

export interface HostCallScope {
  moduleName: string;
  ctx?: CommandContext;
  guildId?: string | null;
  interaction?: AddonInteraction;
}

function requireCtx(scope: HostCallScope): CommandContext {
  if (!scope.ctx) throw new Error("No active invocation for this call");
  return scope.ctx;
}

// Prefixed with the calling addon's name so one addon's keys can never collide
// with, or read, another's or core's.
function addonKey(scope: HostCallScope, key: string): string {
  return `lumi:addon:${scope.moduleName}:${key}`;
}

// Pinned to the active invocation's guild: without this an addon invoked in one
// guild could read and write its rows in every other guild, including ones where
// it is disabled.
function scopedGuild(scope: HostCallScope, requested?: string): string {
  const active = scope.guildId;
  if (active) {
    if (requested && requested !== active) {
      throw new Error(
        `Addon "${scope.moduleName}" tried to reach guild ${requested} while handling an interaction in ${active}`,
      );
    }
    return active;
  }
  if (!requested) throw new Error("This action requires a guild");
  return requested;
}

type OptionGetter =
  | "getString"
  | "getInteger"
  | "getNumber"
  | "getBoolean"
  | "getUser"
  | "getRole"
  | "getChannel";

async function fetchGuildMember(guildId: string, userId: string) {
  const guild = container.client.guilds.cache.get(guildId);
  if (!guild) throw new Error(`Guild ${guildId} is not in cache`);
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) throw new Error(`Member ${userId} not found in guild ${guildId}`);
  return member;
}

// Validated once here, at the boundary where an addon subprocess's JSON crosses
// into the host - request.data's TypeScript annotations below only ever described
// the shape at compile time. Every field that flows into a Valkey/DB key or a
// Discord API call is checked at runtime; free-form payloads (Discord message/
// modal builders) are left as z.unknown() since discord.js itself validates them.
const ParamSchemas: Record<string, z.ZodType> = {
  "ctx.option": z.object({
    getter: z.union([
      z.literal("getString"),
      z.literal("getInteger"),
      z.literal("getNumber"),
      z.literal("getBoolean"),
      z.literal("getUser"),
      z.literal("getRole"),
      z.literal("getChannel"),
    ]),
    name: z.string(),
    spec: z.unknown().optional(),
  }),

  "ctx.defer": z.object({
    ephemeral: z.boolean().optional(),
    update: z.boolean().optional(),
  }),

  "ctx.reply": z.object({
    card: z.unknown(),
    ephemeral: z.boolean().optional(),
  }),

  "ctx.editReply": z.object({
    card: z.unknown(),
    ephemeral: z.boolean().optional(),
  }),

  "ctx.checkPermit": z.object({
    node: z.string(),
  }),

  "ctx.showModal": z.object({
    modal: z.unknown(),
  }),

  "config.get": z.object({
    key: z.string(),
    guildId: z.string().optional(),
  }),

  "kv.get": z.object({
    guildId: z.string(),
    targetId: z.string(),
    key: z.string(),
  }),

  "kv.set": z.object({
    guildId: z.string(),
    targetId: z.string(),
    key: z.string(),
    value: z.unknown(),
  }),

  "kv.delete": z.object({
    guildId: z.string(),
    targetId: z.string(),
    key: z.string(),
  }),

  "kv.list": z.object({
    key: z.string(),
    guildId: z.string().optional(),
  }),

  "kv.incr": z.object({
    guildId: z.string(),
    targetId: z.string(),
    key: z.string(),
    delta: z.number().optional(),
  }),

  "valkey.sadd": z.object({
    key: z.string(),
    members: z.array(z.string()),
  }),

  "valkey.srem": z.object({
    key: z.string(),
    members: z.array(z.string()),
  }),

  "valkey.scard": z.object({
    key: z.string(),
  }),

  "valkey.smembers": z.object({
    key: z.string(),
  }),

  "valkey.del": z.object({
    key: z.string(),
  }),

  "valkey.set": z.object({
    key: z.string(),
    value: z.string(),
    ttlSeconds: z.number().optional(),
  }),

  "valkey.get": z.object({
    key: z.string(),
  }),

  "schedule.add": z.object({
    task: z.string(),
    payload: z.record(z.string(), z.unknown()),
    delay: z.number().optional(),
  }),

  "discord.channels.send": z.object({
    channelId: z.string(),
    payload: z.unknown(),
  }),

  "discord.messages.fetch": z.object({
    channelId: z.string(),
    messageId: z.string(),
  }),

  "discord.messages.edit": z.object({
    channelId: z.string(),
    messageId: z.string(),
    payload: z.unknown(),
  }),

  "discord.guilds.get": z.object({
    guildId: z.string(),
  }),

  "discord.guilds.members.fetch": z.object({
    guildId: z.string(),
    userId: z.string(),
  }),

  "discord.members.move": z.object({
    guildId: z.string(),
    userId: z.string(),
    channelId: z.string(),
  }),

  "discord.roles.create": z.object({
    guildId: z.string(),
    name: z.string(),
    color: z.string().optional(),
    mentionable: z.boolean().optional(),
    reason: z.string().optional(),
  }),

  "discord.roles.edit": z.object({
    guildId: z.string(),
    roleId: z.string(),
    name: z.string().optional(),
    color: z.string().nullable().optional(),
    mentionable: z.boolean().optional(),
    reason: z.string().optional(),
  }),

  "discord.roles.remove": z.object({
    guildId: z.string(),
    roleId: z.string(),
    reason: z.string().optional(),
  }),

  "discord.roles.fetch": z.object({
    guildId: z.string(),
    roleId: z.string(),
  }),

  "discord.emoji.create": z.object({
    guildId: z.string(),
    name: z.string(),
    attachment: z.string(),
    reason: z.string().optional(),
  }),

  "discord.stickers.create": z.object({
    guildId: z.string(),
    name: z.string(),
    attachment: z.string(),
    tags: z.string().optional(),
    description: z.string().optional(),
    reason: z.string().optional(),
  }),

  "discord.stickers.fetch": z.object({
    guildId: z.string(),
    stickerId: z.string(),
  }),

  "discord.channels.create": z.object({
    guildId: z.string(),
    name: z.string(),
    type: z.union([z.literal("voice"), z.literal("text")]),
    parentId: z.string().optional(),
    reason: z.string().optional(),
  }),

  "discord.channels.remove": z.object({
    channelId: z.string(),
    reason: z.string().optional(),
  }),

  "discord.channels.permissions": z.object({
    channelId: z.string(),
    targetId: z.string(),
    allow: z.array(z.string()).optional(),
    deny: z.array(z.string()).optional(),
  }),

  "discord.channels.members": z.object({
    channelId: z.string(),
  }),

  "discord.threads.create": z.object({
    channelId: z.string(),
    name: z.string(),
    messageId: z.string().optional(),
    autoArchiveMinutes: z.number().optional(),
  }),

  "discord.threads.archive": z.object({
    threadId: z.string(),
    locked: z.boolean().optional(),
  }),

  "discord.threads.remove": z.object({
    threadId: z.string(),
  }),

  "discord.client.presence": z.object({
    status: z.union([
      z.literal("online"),
      z.literal("idle"),
      z.literal("dnd"),
      z.literal("invisible"),
    ]).optional(),
    activities: z.array(z.object({
      name: z.string(),
      type: z.number().optional(),
      state: z.string().optional(),
      url: z.string().optional(),
    })).optional(),
  }),

  "discord.client.stats": z.object({}),

  "log": z.object({
    level: z.union([z.literal("info"), z.literal("warn"), z.literal("error")]),
    message: z.string(),
  }),
};

const Methods = {
  async "ctx.option"(
    { getter, name, spec }: { getter: OptionGetter; name: string; spec?: CtxOptionSpec },
    scope: HostCallScope,
  ) {
    const ctx = requireCtx(scope);
    const value = await ctx[getter](name, spec ?? {});
    if (value === null || value === undefined) return null;
    if (getter === "getUser") {
      const user = value as { id: string; username?: string };
      return { id: user.id, ...(user.username ? { name: user.username } : {}) };
    }
    if (getter === "getRole" || getter === "getChannel") {
      const target = value as { id: string; name?: string | null };
      return { id: target.id, ...(target.name ? { name: target.name } : {}) };
    }
    return value;
  },

  async "ctx.defer"({ ephemeral, update }: { ephemeral?: boolean; update?: boolean }, scope: HostCallScope) {
    if (scope.interaction) {
      if (update && scope.interaction.isMessageComponent()) {
        await scope.interaction.deferUpdate();
      } else {
        await scope.interaction.deferReply(
          ephemeral === false ? {} : { flags: MessageFlags.Ephemeral },
        );
      }
      return;
    }
    await requireCtx(scope).defer({ ephemeral });
  },

  async "ctx.reply"(
    { card, ephemeral }: { card: CardReply; ephemeral?: boolean },
    scope: HostCallScope,
  ) {
    if (scope.interaction) {
      await sendInteractionReply(
        scope.interaction as RepliableInteraction,
        ephemeral === false ? card : ephemeralCard(card),
        "edit",
      );
      return;
    }
    await requireCtx(scope).reply(card, { ephemeral });
  },

  async "ctx.editReply"(
    { card, ephemeral }: { card: CardReply; ephemeral?: boolean },
    scope: HostCallScope,
  ) {
    if (scope.interaction) {
      await sendInteractionReply(
        scope.interaction as RepliableInteraction,
        ephemeral === false ? card : ephemeralCard(card),
        "edit",
      );
      return;
    }
    await requireCtx(scope).reply(card, { ephemeral });
  },

  async "ctx.checkPermit"({ node }: { node: string }, scope: HostCallScope) {
    await requireCtx(scope).checkPermit(node);
  },

  async "config.get"({ key, guildId }: { key: string; guildId?: string }, scope: HostCallScope) {
    return container.db.config.getModuleConfig(
      scopedGuild(scope, guildId),
      scope.moduleName,
      key,
    );
  },

  async "kv.get"(
    { guildId, targetId, key }: { guildId: string; targetId: string; key: string },
    scope: HostCallScope,
  ) {
    return container.db.guildKV.getModuleData(
      scopedGuild(scope, guildId),
      scope.moduleName,
      targetId,
      key,
    );
  },

  async "kv.set"(
    { guildId, targetId, key, value }: { guildId: string; targetId: string; key: string; value: unknown },
    scope: HostCallScope,
  ) {
    await container.db.guildKV.setModuleData(
      scopedGuild(scope, guildId),
      scope.moduleName,
      targetId,
      key,
      value,
    );
  },

  async "kv.delete"(
    { guildId, targetId, key }: { guildId: string; targetId: string; key: string },
    scope: HostCallScope,
  ) {
    return container.db.guildKV.deleteModuleData(
      scopedGuild(scope, guildId),
      scope.moduleName,
      targetId,
      key,
    );
  },

  async "kv.list"({ key, guildId }: { key: string; guildId?: string }, scope: HostCallScope) {
    return container.db.guildKV.listModuleData({
      module: scope.moduleName,
      key,
      guildId: scopedGuild(scope, guildId),
    });
  },

  async "kv.incr"(
    { guildId, targetId, key, delta = 1 }: { guildId: string; targetId: string; key: string; delta?: number },
    scope: HostCallScope,
  ) {
    return container.db.guildKV.incrModuleData(
      scopedGuild(scope, guildId),
      scope.moduleName,
      targetId,
      key,
      delta,
    );
  },

  async "ctx.showModal"({ modal }: { modal: unknown }, scope: HostCallScope) {
    if (scope.interaction) {
      if (!scope.interaction.isMessageComponent()) {
        throw new Error("showModal is only valid on a button or select interaction");
      }
      await scope.interaction.showModal(modal as never);
      return;
    }
    const ctx = requireCtx(scope);
    if (!ctx.isSlash) {
      throw new Error("showModal needs an open slash command or component interaction");
    }
    await (ctx.interaction as ChatInputCommandInteraction).showModal(modal as never);
  },

  async "valkey.sadd"({ key, members }: { key: string; members: string[] }, scope: HostCallScope) {
    return container.valkey.sadd(addonKey(scope, key), ...members);
  },

  async "valkey.srem"({ key, members }: { key: string; members: string[] }, scope: HostCallScope) {
    return container.valkey.srem(addonKey(scope, key), ...members);
  },

  async "valkey.scard"({ key }: { key: string }, scope: HostCallScope) {
    return container.valkey.scard(addonKey(scope, key));
  },

  async "valkey.smembers"({ key }: { key: string }, scope: HostCallScope) {
    return container.valkey.smembers(addonKey(scope, key));
  },

  async "valkey.del"({ key }: { key: string }, scope: HostCallScope) {
    return container.valkey.del(addonKey(scope, key));
  },

  async "valkey.set"(
    { key, value, ttlSeconds }: { key: string; value: string; ttlSeconds?: number },
    scope: HostCallScope,
  ) {
    const namespaced = addonKey(scope, key);
    if (ttlSeconds === undefined) {
      await container.valkey.set(namespaced, value);
      return;
    }
    await container.valkey.set(namespaced, value, "EX", Math.max(1, Math.floor(ttlSeconds)));
  },

  async "valkey.get"({ key }: { key: string }, scope: HostCallScope) {
    return container.valkey.get(addonKey(scope, key));
  },

  async "schedule.add"(
    { task, payload, delay }: { task: string; payload: Record<string, unknown>; delay?: number },
    scope: HostCallScope,
  ) {
    await scheduleTask(
      AddonRelayTaskName as never,
      { addon: scope.moduleName, task, payload } as never,
      delay === undefined ? undefined : { delay },
    );
  },

  // No schedule.cancel: BullMQ job ids are not namespaced, so an addon could
  // delete core's tempban expiries. Revisit when schedule.add returns an owned id.

  async "discord.channels.send"(
    { channelId, payload }: { channelId: string; payload: MessagePayload },
    _scope: HostCallScope,
  ) {
    const channel = await container.client.channels.fetch(channelId);
    if (!channel?.isSendable()) throw new Error(`Channel ${channelId} is not sendable`);
    const message = await channel.send(payload as never);
    return { id: message.id, channelId: message.channelId };
  },

  async "discord.messages.fetch"(
    { channelId, messageId }: { channelId: string; messageId: string },
    _scope: HostCallScope,
  ) {
    const channel = await container.client.channels.fetch(channelId);
    if (!channel?.isTextBased()) return null;
    const message = await channel.messages.fetch(messageId).catch(() => null);
    return (
      message && {
        id: message.id,
        channelId: message.channelId,
        content: message.content,
        repliedToId: message.reference?.messageId ?? null,
        attachments: [...message.attachments.values()].map((attachment) => ({
          id: attachment.id,
          url: attachment.url,
          contentType: attachment.contentType ?? null,
          size: attachment.size,
        })),
      }
    );
  },

  async "discord.messages.edit"(
    { channelId, messageId, payload }: { channelId: string; messageId: string; payload: MessagePayload },
    _scope: HostCallScope,
  ) {
    const channel = await container.client.channels.fetch(channelId);
    if (!channel?.isTextBased()) throw new Error(`Channel ${channelId} is not a text channel`);
    const message = await channel.messages.fetch(messageId);
    const edited = await message.edit(payload as never);
    return { id: edited.id, channelId: edited.channelId };
  },

  "discord.guilds.get"({ guildId }: { guildId: string }, scope: HostCallScope) {
    const g = container.client.guilds.cache.get(scopedGuild(scope, guildId));
    if (!g) return null;
    return { id: g.id, name: g.name, memberCount: g.memberCount ?? null };
  },

  async "discord.guilds.members.fetch"({ guildId, userId }: { guildId: string; userId: string }, scope: HostCallScope) {
    const g = container.client.guilds.cache.get(scopedGuild(scope, guildId));
    if (!g) return null;
    const m = await g.members.fetch(userId).catch(() => null);
    if (!m) return null;
    const primary = m.user.primaryGuild;
    return {
      id: m.id,
      roles: [...m.roles.cache.keys()],
      premiumSince: m.premiumSinceTimestamp,
      primaryGuild: primary
        ? {
            identityGuildId: primary.identityGuildId ?? null,
            identityEnabled: primary.identityEnabled ?? null,
            tag: primary.tag ?? null,
          }
        : null,
    };
  },

  async "discord.members.roles.add"(
    { guildId, userId, roleId }: { guildId: string; userId: string; roleId: string },
    scope: HostCallScope,
  ) {
    const m = await fetchGuildMember(scopedGuild(scope, guildId), userId);
    await m.roles.add(roleId);
  },

  async "discord.members.roles.remove"(
    { guildId, userId, roleId }: { guildId: string; userId: string; roleId: string },
    scope: HostCallScope,
  ) {
    const m = await fetchGuildMember(scopedGuild(scope, guildId), userId);
    await m.roles.remove(roleId);
  },

  async "discord.members.timeout"(
    { guildId, userId, durationMs, reason }: { guildId: string; userId: string; durationMs: number | null; reason?: string },
    scope: HostCallScope,
  ) {
    const m = await fetchGuildMember(scopedGuild(scope, guildId), userId);
    await m.timeout(durationMs, reason);
  },

  async "discord.members.move"(
    { guildId, userId, channelId }: { guildId: string; userId: string; channelId: string },
    scope: HostCallScope,
  ) {
    const m = await fetchGuildMember(scopedGuild(scope, guildId), userId);
    await m.voice.setChannel(channelId);
  },

  async "discord.roles.create"(
    { guildId, name, color, mentionable, reason }: { guildId: string; name: string; color?: string; mentionable?: boolean; reason?: string },
    scope: HostCallScope,
  ) {
    const guild = container.client.guilds.cache.get(scopedGuild(scope, guildId));
    if (!guild) throw new Error(`Guild ${guildId} is not in cache`);
    const role = await guild.roles.create({
      name,
      ...(color ? { color: color as never } : {}),
      ...(mentionable !== undefined ? { mentionable } : {}),
      ...(reason ? { reason } : {}),
    });
    return { id: role.id };
  },

  async "discord.roles.edit"(
    { guildId, roleId, name, color, mentionable, reason }: { guildId: string; roleId: string; name?: string; color?: string | null; mentionable?: boolean; reason?: string },
    scope: HostCallScope,
  ) {
    const guild = container.client.guilds.cache.get(scopedGuild(scope, guildId));
    if (!guild) throw new Error(`Guild ${guildId} is not in cache`);
    const role = await guild.roles.fetch(roleId);
    if (!role) throw new Error(`Role ${roleId} not found in guild ${guildId}`);
    await role.edit({
      ...(name !== undefined ? { name } : {}),
      ...(color !== undefined ? { color: color as never } : {}),
      ...(mentionable !== undefined ? { mentionable } : {}),
      ...(reason ? { reason } : {}),
    });
    return { id: role.id };
  },

  async "discord.roles.remove"(
    { guildId, roleId, reason }: { guildId: string; roleId: string; reason?: string },
    scope: HostCallScope,
  ) {
    const guild = container.client.guilds.cache.get(scopedGuild(scope, guildId));
    if (!guild) throw new Error(`Guild ${guildId} is not in cache`);
    const role = await guild.roles.fetch(roleId);
    if (!role) throw new Error(`Role ${roleId} not found in guild ${guildId}`);
    await role.delete(reason);
  },

  async "discord.roles.fetch"(
    { guildId, roleId }: { guildId: string; roleId: string },
    scope: HostCallScope,
  ) {
    const guild = container.client.guilds.cache.get(scopedGuild(scope, guildId));
    if (!guild) return null;
    const role = await guild.roles.fetch(roleId).catch(() => null);
    if (!role) return null;
    return {
      id: role.id,
      name: role.name,
      color: role.hexColor,
      mentionable: role.mentionable,
      managed: role.managed,
      position: role.position,
    };
  },

  async "discord.emoji.create"(
    { guildId, name, attachment, reason }: { guildId: string; name: string; attachment: string; reason?: string },
    scope: HostCallScope,
  ) {
    const guild = container.client.guilds.cache.get(scopedGuild(scope, guildId));
    if (!guild) throw new Error(`Guild ${guildId} is not in cache`);
    const emoji = await guild.emojis.create({ attachment, name, ...(reason ? { reason } : {}) });
    return { id: emoji.id };
  },

  async "discord.stickers.create"(
    { guildId, name, attachment, tags, description, reason }: { guildId: string; name: string; attachment: string; tags?: string; description?: string; reason?: string },
    scope: HostCallScope,
  ) {
    const guild = container.client.guilds.cache.get(scopedGuild(scope, guildId));
    if (!guild) throw new Error(`Guild ${guildId} is not in cache`);
    const sticker = await guild.stickers.create({
      file: attachment,
      name,
      tags: tags ?? name,
      ...(description ? { description } : {}),
      ...(reason ? { reason } : {}),
    });
    return { id: sticker.id };
  },

  async "discord.stickers.fetch"(
    { guildId, stickerId }: { guildId: string; stickerId: string },
    scope: HostCallScope,
  ) {
    const guild = container.client.guilds.cache.get(scopedGuild(scope, guildId));
    if (!guild) throw new Error(`Guild ${guildId} is not in cache`);
    const sticker = await guild.stickers.fetch(stickerId).catch(() => null);
    if (!sticker) return null;
    return { id: sticker.id, name: sticker.name, tags: sticker.tags, url: sticker.url };
  },

  async "discord.channels.create"(
    { guildId, name, type, parentId, reason }: { guildId: string; name: string; type: "voice" | "text"; parentId?: string; reason?: string },
    scope: HostCallScope,
  ) {
    const guild = container.client.guilds.cache.get(scopedGuild(scope, guildId));
    if (!guild) throw new Error(`Guild ${guildId} is not in cache`);
    const channel = await guild.channels.create({
      name,
      type: type === "voice" ? ChannelType.GuildVoice : ChannelType.GuildText,
      ...(parentId ? { parent: parentId } : {}),
      ...(reason ? { reason } : {}),
    });
    return { id: channel.id };
  },

  async "discord.channels.remove"(
    { channelId, reason }: { channelId: string; reason?: string },
    _scope: HostCallScope,
  ) {
    const channel = await container.client.channels.fetch(channelId).catch(() => null);
    if (!channel || !("delete" in channel) || typeof channel.delete !== "function") {
      throw new Error(`Channel ${channelId} cannot be deleted`);
    }
    await (channel as { delete: (reason?: string) => Promise<unknown> }).delete(reason);
  },

  async "discord.channels.permissions"(
    { channelId, targetId, allow, deny }: { channelId: string; targetId: string; allow?: string[]; deny?: string[] },
    _scope: HostCallScope,
  ) {
    const channel = await container.client.channels.fetch(channelId).catch(() => null);
    if (!channel || !("permissionOverwrites" in channel)) {
      throw new Error(`Channel ${channelId} has no permission overwrites`);
    }
    const flags = PermissionsBitField.Flags as unknown as Record<string, bigint>;
    const resolve = (names: string[] | undefined) =>
      (names ?? []).map((name) => {
        const bit = flags[name];
        if (bit === undefined) throw new Error(`Unknown permission flag "${name}"`);
        return bit;
      });
    const allowBits = resolve(allow).reduce((acc, bit) => acc | bit, 0n);
    const denyBits = resolve(deny).reduce((acc, bit) => acc | bit, 0n);
    await (channel as { permissionOverwrites: { edit: (target: string, perms: { Allow: bigint; Deny: bigint }) => Promise<unknown> } }).permissionOverwrites.edit(targetId, { Allow: allowBits, Deny: denyBits });
  },

  async "discord.channels.members"(
    { channelId }: { channelId: string },
    _scope: HostCallScope,
  ) {
    const channel = await container.client.channels.fetch(channelId).catch(() => null);
    if (!channel || !("isVoiceBased" in channel) || !channel.isVoiceBased()) {
      throw new Error(`Channel ${channelId} is not a voice channel`);
    }
    return [...(channel as { members: Map<string, unknown> }).members.keys()];
  },

  async "discord.threads.create"(
    { channelId, name, messageId, autoArchiveMinutes }: { channelId: string; name: string; messageId?: string; autoArchiveMinutes?: number },
    _scope: HostCallScope,
  ) {
    const channel = await container.client.channels.fetch(channelId).catch(() => null);
    if (!channel || !("threads" in channel)) {
      throw new Error(`Channel ${channelId} does not support threads`);
    }
    const threads = (
      channel as {
        threads: {
          create: (opts: { name: string; startMessage?: string; autoArchiveDuration?: number }) => Promise<{ id: string }>;
        };
      }
    ).threads;
    const thread = await threads.create({
      name,
      ...(messageId ? { startMessage: messageId } : {}),
      ...(autoArchiveMinutes ? { autoArchiveDuration: autoArchiveMinutes } : {}),
    });
    return { id: thread.id };
  },

  async "discord.threads.archive"(
    { threadId, locked }: { threadId: string; locked?: boolean },
    _scope: HostCallScope,
  ) {
    const thread = await container.client.channels.fetch(threadId).catch(() => null);
    if (!thread || !("setArchived" in thread)) {
      throw new Error(`Thread ${threadId} not found`);
    }
    await (thread as { setArchived: (archived: boolean, reason?: string) => Promise<unknown> }).setArchived(true);
    if (locked) {
      await (thread as { setLocked: (locked: boolean) => Promise<unknown> }).setLocked(true);
    }
  },

  async "discord.threads.remove"(
    { threadId }: { threadId: string },
    _scope: HostCallScope,
  ) {
    const thread = await container.client.channels.fetch(threadId).catch(() => null);
    if (!thread || !("delete" in thread) || typeof thread.delete !== "function") {
      throw new Error(`Thread ${threadId} not found`);
    }
    await (thread as { delete: () => Promise<unknown> }).delete();
  },

  "discord.client.presence"(
    { status, activities }: { status?: "online" | "idle" | "dnd" | "invisible"; activities?: { name: string; type?: number; state?: string; url?: string }[] },
    _scope: HostCallScope,
  ) {
    container.client.user?.setPresence({
      ...(status ? { status } : {}),
      ...(activities ? { activities: activities as never } : {}),
    });
  },

  "discord.client.stats"(_data: Record<string, never>, _scope: HostCallScope) {
    const guilds = container.client.guilds.cache;
    return {
      guilds: guilds.size,
      users: guilds.reduce((total, guild) => total + (guild.memberCount ?? 0), 0),
    };
  },

  async "discord.messages.delete"(
    { channelId, messageId }: { channelId: string; messageId: string },
    _scope: HostCallScope,
  ) {
    const channel = await container.client.channels.fetch(channelId);
    if (!channel?.isTextBased()) throw new Error(`Channel ${channelId} is not a text channel`);
    await channel.messages.delete(messageId);
  },

  async "discord.channels.fetch"(
    { channelId }: { channelId: string },
    _scope: HostCallScope,
  ) {
    const channel = await container.client.channels.fetch(channelId).catch(() => null);
    if (!channel || !("guildId" in channel)) return null;
    return {
      id: channel.id,
      guildId: (channel as { guildId: string }).guildId,
      type: channel.type,
      name: "name" in channel ? (channel.name) : null,
    };
  },

  async "modules.enabled"(
    { guildId, names }: { guildId: string; names: string[] },
    scope: HostCallScope,
  ) {
    const result = await container.db.modules.areModulesEnabled(
      scopedGuild(scope, guildId),
      names,
    );
    return Object.fromEntries(result);
  },

  log({ level, message }: { level: "info" | "warn" | "error"; message: string }, scope: HostCallScope) {
    container.logger[level](`[addon:${scope.moduleName}] ${message}`);
  },
} satisfies Record<string, (params: never, scope: HostCallScope) => unknown>;

export function callHostMethod(
  request: AddonRpcRequest,
  scope: HostCallScope,
): Promise<unknown> {
  if (!Object.hasOwn(Methods, request.action)) {
    throw new Error(`Unknown addon method "${request.action}"`);
  }
  const validator = ParamSchemas[request.action];
  if (!validator) {
    throw new Error(`Missing parameter schema validator for "${request.action}"`);
  }
  const data = validator.parse(request.data);
  const method = Methods[request.action] as (
    params: unknown,
    scope: HostCallScope,
  ) => unknown;
  return Promise.resolve(method(data, scope));
}
