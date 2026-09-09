import { container } from "@sapphire/framework";
import type {
  MessageComponentInteraction,
  ModalSubmitInteraction,
  RepliableInteraction,
} from "discord.js";
import type { AddonRpcRequest } from "@lumi/contracts";
import type { CommandContext, CtxOptionSpec } from "#lib/command-context.js";
import { MessageFlags } from "discord.js";
import { ephemeralCard, type CardReply } from "#lib/utilities/cards.js";
import { sendInteractionReply } from "#lib/utilities/command-response.js";
import { scheduleTask } from "#lib/schedule-task.js";
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

  async "ctx.showModal"({ modal }: { modal: unknown }, scope: HostCallScope) {
    const interaction = requireInteraction(scope);
    if (!interaction.isMessageComponent()) {
      throw new Error("showModal is only valid on a button or select interaction");
    }
    await interaction.showModal(modal as never);
  },

  async "redis.sadd"({ key, members }: { key: string; members: string[] }, scope: HostCallScope) {
    return container.redis.sadd(addonKey(scope, key), ...members);
  },

  async "redis.srem"({ key, members }: { key: string; members: string[] }, scope: HostCallScope) {
    return container.redis.srem(addonKey(scope, key), ...members);
  },

  async "redis.scard"({ key }: { key: string }, scope: HostCallScope) {
    return container.redis.scard(addonKey(scope, key));
  },

  async "redis.smembers"({ key }: { key: string }, scope: HostCallScope) {
    return container.redis.smembers(addonKey(scope, key));
  },

  async "redis.del"({ key }: { key: string }, scope: HostCallScope) {
    return container.redis.del(addonKey(scope, key));
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
  const method = Methods[request.action] as (
    params: unknown,
    scope: HostCallScope,
  ) => unknown;
  return Promise.resolve(method(request.data, scope));
}
