// boundary, where no threaded services bag crosses today. They read the global
// boot container directly until the IPC scope carries services explicitly.
import { container } from "#lib/services.js";
import { z } from "zod";
import type {
  MessageComponentInteraction,
  ModalSubmitInteraction,
  RepliableInteraction,
} from "discord.js";
import type { AddonRpcRequest } from "@lumi/contracts";
import type { CommandContext, CtxOptionSpec } from "#lib/commands/context.js";
import { MessageFlags } from "discord.js";
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

function requireInteraction(scope: HostCallScope): AddonInteraction {
  if (!scope.interaction) throw new Error("No active interaction for this call");
  return scope.interaction;
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

type OptionGetter = "getString" | "getInteger" | "getNumber" | "getBoolean";

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
    payload: z.unknown(),
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
    return ctx[getter](name, spec ?? {});
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

  async "ctx.editReply"({ payload }: { payload: MessagePayload }, scope: HostCallScope) {
    await requireInteraction(scope).editReply(payload as never);
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
    const interaction = requireInteraction(scope);
    if (!interaction.isMessageComponent()) {
      throw new Error("showModal is only valid on a button or select interaction");
    }
    await interaction.showModal(modal as never);
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
    return message && { id: message.id, channelId: message.channelId, content: message.content };
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
    return { id: g.id, name: g.name };
  },

  async "discord.guilds.members.fetch"({ guildId, userId }: { guildId: string; userId: string }, scope: HostCallScope) {
    const g = container.client.guilds.cache.get(scopedGuild(scope, guildId));
    if (!g) return null;
    const m = await g.members.fetch(userId).catch(() => null);
    if (!m) return null;
    return {
      id: m.id,
      roles: [...m.roles.cache.keys()],
      premiumSince: m.premiumSinceTimestamp,
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
      name: "name" in channel ? (channel.name as string) : null,
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
