import type { ModuleLoader } from "@lumi/module-runtime";
import {
  type CardReply,
  cardMessage,
  ephemeralCard,
  makeErrorCard,
} from "@lumi/ui";
import type { Client, Message } from "discord.js";
import {
  hasAdminAccess,
  hasPermitAccess,
  permitEnforcementEnabled,
  roleIdsFrom,
} from "./access.js";
import { isGuildBlacklisted, isUserBlacklisted } from "./blacklist.js";
import type { BotServices } from "./contracts.js";
import type { ErrorStore } from "./errorStore.js";
import { commandErrorCard } from "./errors.js";
import { isModuleLocked } from "./locks.js";
import {
  type CommandRegistry,
  type RegisteredCommand,
  servicesForModule,
} from "./modules.js";
import { isBotOwner } from "@lumi/permits";

export const DefaultPrefix = process.env.DEFAULT_PREFIX ?? ",";
const UserMention = /^<@!?(\d+)>$/;
const RoleMention = /^<@&(\d+)>$/;
const ChannelMention = /^<#(\d+)>$/;
const Snowflake = /^\d{15,20}$/;

export interface PrefixLogger {
  error(message: string, meta?: unknown): void;
}

export interface PrefixContext {
  client: Client;
  registry: CommandRegistry;
  moduleLoader: Pick<ModuleLoader, "isActive">;
  services: BotServices;
  logger: PrefixLogger;
  errorStore?: ErrorStore;
}

function idFromValue(value: string | null, pattern: RegExp): string | null {
  if (!value) return null;
  return pattern.exec(value)?.[1] ?? (Snowflake.test(value) ? value : null);
}

async function replyError(
  message: Message,
  title: string,
  body: string,
): Promise<void> {
  await message
    .reply(cardMessage(ephemeralCard(makeErrorCard(title, body))))
    .catch(() => undefined);
}

async function resolvePrefix(
  client: Client,
  services: BotServices,
  message: Message,
): Promise<string | null> {
  const mention = new RegExp(`^<@!?${client.user?.id}>\\s*`).exec(
    message.content,
  );
  if (mention) return mention[0];
  if (!message.guild) return null;
  const stored = await services.configService.get(message.guild.id, "prefix");
  const prefix =
    typeof stored === "string" && stored.length > 0 ? stored : DefaultPrefix;
  return message.content.startsWith(prefix) ? prefix : null;
}

function createSyntheticInteraction(
  message: Message,
  command: RegisteredCommand,
  args: string[],
  prefix: string,
) {
  const guild = message.guild!;
  const member = message.member;
  const channel = message.channel;
  const commandName = command.data.name;
  let replied = false;
  let deferred = false;
  let replyMessage: Message | undefined;

  const commandJson = command.data.toJSON();
  interface CommandOption {
    readonly name: string;
    readonly type: number;
    readonly options?: readonly CommandOption[];
  }
  const topOptions = (("options" in commandJson ? commandJson.options : []) ??
    []) as readonly CommandOption[];
  const group = topOptions.find(
    (option) => option.type === 2 && option.name === args[0],
  );
  const groupOptions = group?.options ?? [];
  const subcommand = group
    ? groupOptions.find(
        (option) => option.type === 1 && option.name === args[1],
      )
    : topOptions.find((option) => option.type === 1 && option.name === args[0]);
  const definitions = group
    ? (subcommand?.options ?? [])
    : subcommand
      ? (subcommand.options ?? [])
      : topOptions.filter((option) => option.type !== 1 && option.type !== 2);
  const rest = group ? args.slice(2) : subcommand ? args.slice(1) : args;
  const values = new Map<string, string>();
  const positional: string[] = [];

  for (let index = 0; index < rest.length; index += 1) {
    const value = rest[index]!;
    if (value.startsWith("--")) {
      const next = rest[index + 1];
      if (next !== undefined && !next.startsWith("--")) {
        values.set(value.slice(2), next);
        index += 1;
      }
      continue;
    }
    positional.push(value);
  }

  let position = 0;
  for (const definition of definitions) {
    if (values.has(definition.name)) continue;
    if (position >= positional.length) break;
    values.set(definition.name, positional[position]!);
    position += 1;
  }

  const raw = (name: string): string | null => values.get(name) ?? null;
  const resolveUser = (value: string | null) => {
    const id = idFromValue(value, UserMention);
    return id
      ? (message.client.users.cache.get(id) ??
          message.mentions.users.get(id) ??
          null)
      : null;
  };
  const resolveMember = (value: string | null) => {
    const id = idFromValue(value, UserMention);
    return id
      ? (guild.members.cache.get(id) ??
          message.mentions.members?.get(id) ??
          null)
      : null;
  };
  const resolveRole = (value: string | null) => {
    const id = idFromValue(value, RoleMention);
    return id
      ? (guild.roles.cache.get(id) ?? message.mentions.roles.get(id) ?? null)
      : null;
  };
  const resolveChannel = (value: string | null) => {
    const id = idFromValue(value, ChannelMention);
    return id
      ? (guild.channels.cache.get(id) ??
          message.mentions.channels.get(id) ??
          null)
      : null;
  };

  return {
    commandName,
    user: message.author,
    member,
    guild,
    guildId: guild.id,
    channel,
    channelId: channel.id,
    client: message.client,
    createdTimestamp: message.createdTimestamp,
    sourceMessage: message,
    prefix,
    isChatInputCommand: () => true,
    isRepliable: () => true,
    replied: () => replied,
    deferred: () => deferred,
    options: {
      getSubcommand: () => subcommand?.name ?? null,
      getSubcommandGroup: () => group?.name ?? null,
      getString: raw,
      getInteger: (name: string) => {
        const value = raw(name);
        if (value === null) return null;
        const parsed = Number.parseInt(value, 10);
        return Number.isNaN(parsed) ? null : parsed;
      },
      getNumber: (name: string) => {
        const value = raw(name);
        if (value === null) return null;
        const parsed = Number.parseFloat(value);
        return Number.isNaN(parsed) ? null : parsed;
      },
      getBoolean: (name: string) => {
        const value = raw(name)?.toLowerCase();
        return (
          value === "true" || value === "yes" || value === "on" || value === "1"
        );
      },
      getUser: (name: string) => resolveUser(raw(name)),
      getMember: (name: string) => resolveMember(raw(name)),
      getChannel: (name: string) => resolveChannel(raw(name)),
      getRole: (name: string) => resolveRole(raw(name)),
      getMentionable: (name: string) => {
        const value = raw(name);
        return (
          resolveUser(value) ??
          resolveMember(value) ??
          resolveRole(value) ??
          resolveChannel(value)
        );
      },
      getAttachment: () => null,
      getFocused: () => {
        throw new Error("Not supported");
      },
    },
    reply: async (card: CardReply) => {
      const cardToSend = { ...card, flags: (card.flags ?? 32768) & ~64 };
      replyMessage = await message
        .reply(cardMessage(cardToSend))
        .catch(() => undefined);
      replied = true;
      return replyMessage;
    },
    deferReply: async () => {
      deferred = true;
    },
    editReply: async (card: CardReply) => {
      if (replyMessage) {
        await replyMessage.edit(cardMessage(card)).catch(() => undefined);
        return;
      }
      const cardToSend = { ...card, flags: (card.flags ?? 32768) & ~64 };
      replyMessage = await message
        .reply(cardMessage(cardToSend))
        .catch(() => undefined);
      replied = true;
    },
    followUp: async (card: CardReply) =>
      await message.reply(cardMessage(card)).catch(() => undefined),
  };
}

export async function handlePrefixMessage(
  message: Message,
  context: PrefixContext,
): Promise<void> {
  try {
    if (message.partial) {
      const full = await message.fetch().catch(() => null);
      if (!full) return;
      message = full;
    }
    if (message.author.bot || !message.guild) return;
    if (
      !isBotOwner(message.author.id) &&
      context.services.prisma &&
      context.services.helpers?.cache
    ) {
      const [userBlocked, guildBlocked] = await Promise.all([
        isUserBlacklisted(
          context.services.prisma,
          context.services.helpers.cache,
          message.author.id,
        ),
        isGuildBlacklisted(
          context.services.prisma,
          context.services.helpers.cache,
          message.guild.id,
        ),
      ]);
      if (userBlocked || guildBlocked) return;
    }

    const prefix = await resolvePrefix(
      context.client,
      context.services,
      message,
    );
    if (!prefix) return;

    const withoutPrefix = message.content.slice(prefix.length).trim();
    if (!withoutPrefix) return;

    const [name, ...args] = withoutPrefix.split(/ +/g);
    if (!name) return;

    const command = context.registry.get(name);
    if (!command) return;
    if (
      command.module &&
      !context.moduleLoader.isActive(message.guild.id, command.module)
    ) {
      return;
    }
    if (
      command.module &&
      context.services.redis &&
      (await isModuleLocked(
        context.services.redis,
        message.guild.id,
        command.module,
      ))
    ) {
      await replyError(
        message,
        "Temporarily Locked",
        `The **${command.module}** module is locked while panic mode is active.`,
      );
      return;
    }

    if (command.ownerOnly && !isBotOwner(message.author.id)) {
      await replyError(
        message,
        "Owner Only",
        "That command is restricted to bot owners.",
      );
      return;
    }

    if (command.requiresAdmin) {
      const allowed = await hasAdminAccess({
        guildId: message.guild.id,
        userId: message.author.id,
        roleIds: roleIdsFrom(message.member, message.guild.id),
        guildOwnerId: message.guild.ownerId,
        memberPermissions: message.member?.permissions,
        enforcePermits: await permitEnforcementEnabled(
          context.services.configService,
          message.guild.id,
        ),
        client: context.client,
        permits: context.services.permits,
      });
      if (!allowed) {
        await replyError(
          message,
          "Missing Permissions",
          "You need **Manage Server** or an admin permit to use that command.",
        );
        return;
      }
    }

    if (
      command.requiredPermit &&
      !(await hasPermitAccess(
        {
          guildId: message.guild.id,
          userId: message.author.id,
          roleIds: roleIdsFrom(message.member, message.guild.id),
          channelId: message.channelId,
          guildOwnerId: message.guild.ownerId,
          enforcePermits: await permitEnforcementEnabled(
            context.services.configService,
            message.guild.id,
          ),
          client: context.client,
          permits: context.services.permits,
        },
        command.requiredPermit,
      ))
    ) {
      await replyError(
        message,
        "Missing Permit",
        `You need the **${command.requiredPermit}** permit on this server.`,
      );
      return;
    }

    const defaultPermissions =
      "default_member_permissions" in command.data
        ? command.data.default_member_permissions
        : null;
    if (
      defaultPermissions !== null &&
      defaultPermissions !== undefined &&
      !message.member?.permissions.has(BigInt(defaultPermissions))
    ) {
      await replyError(
        message,
        "Missing Permissions",
        "You do not have permission to use that command.",
      );
      return;
    }

    const scope = `${message.guild.id}:${message.author.id}:${command.data.name}`;
    if (
      command.cooldownSeconds &&
      command.cooldownSeconds > 0 &&
      context.services.helpers?.cache
    ) {
      const hits = await context.services.helpers.cache.incr(
        `command-cooldown:${scope}`,
        command.cooldownSeconds * 1000,
      );
      if (hits > 1) {
        await replyError(
          message,
          "Slow Down",
          `That command is on cooldown for ${command.cooldownSeconds}s.`,
        );
        return;
      }
    }

    const release =
      command.concurrency === undefined || !context.services.helpers?.cache
        ? null
        : await context.services.helpers.cache.takeLock(
            `command-running:${scope}`,
            60_000,
          );
    if (command.concurrency !== undefined && !release) {
      await replyError(
        message,
        "Already Running",
        "That command is already running for you.",
      );
      return;
    }

    const syntheticInteraction = createSyntheticInteraction(
      message,
      command,
      args,
      prefix,
    );
    try {
      if (command.module === null) {
        await command.execute(syntheticInteraction as never, context.services);
      } else {
        await command.execute(
          syntheticInteraction as never,
          servicesForModule(context.services, command.module),
        );
      }
    } catch (error) {
      const record = await context.errorStore?.record?.({
        error,
        source: "command",
        guildId: message.guild.id,
        userId: message.author.id,
        command: command.data.name,
      });
      context.logger.error("Prefix command failed", {
        command: name,
        guildId: message.guild.id,
        traceId: record?.id,
        error,
      });
      await message
        .reply(cardMessage(commandErrorCard(error, record?.id)))
        .catch(() => undefined);
    } finally {
      await release?.();
    }
  } catch (error) {
    context.logger.error("Prefix dispatch failed", {
      guildId: message.guildId,
      error,
    });
  }
}
