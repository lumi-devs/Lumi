import type { ModuleServices } from "@lumi/module-kit";
import {
  cardCreateOptions,
  cardMessage,
  makeErrorCard,
  makeSuccessCard,
  type CardReply,
} from "@lumi/ui";
import type { Guild, Message } from "discord.js";
import {
  buildRoleMenuCard,
  reactionEmojis,
  type MenuGroup,
  type MenuOption,
  type RoleMenuStyle,
} from "./ui.js";
import { MaxReactionOptions, reactionMatchesEmoji } from "./reactions.js";

export interface PostedMenu {
  readonly channelId: string;
  readonly messageId: string;
}

interface SendableChannel {
  readonly id: string;
  send(options: ReturnType<typeof cardCreateOptions>): Promise<Message>;
}

interface ReadableChannel extends SendableChannel {
  readonly messages: {
    fetch(messageId: string): Promise<Message>;
  };
}

function isSendable(channel: unknown): channel is SendableChannel {
  return Boolean(
    channel &&
    typeof channel === "object" &&
    "id" in channel &&
    "send" in channel &&
    typeof (channel as { send?: unknown }).send === "function",
  );
}

function isReadable(channel: unknown): channel is ReadableChannel {
  if (!isSendable(channel)) return false;
  const messages = (channel as { messages?: unknown }).messages;
  return Boolean(
    messages &&
    typeof messages === "object" &&
    "fetch" in messages &&
    typeof (messages as { fetch?: unknown }).fetch === "function",
  );
}

function validateStyle(
  style: RoleMenuStyle,
  options: readonly MenuOption[],
): string | null {
  if (options.length === 0) return "This role menu has no options.";
  if (options.length > 25 && style !== "reactions") {
    return "Buttons and select menus support at most 25 options.";
  }
  if (options.length > MaxReactionOptions && style === "reactions") {
    return `Reaction menus support at most ${MaxReactionOptions} options.`;
  }
  return null;
}

export async function postRoleMenu(
  services: ModuleServices,
  guild: Guild,
  group: MenuGroup,
  options: readonly MenuOption[],
  style: RoleMenuStyle,
  channel: SendableChannel,
): Promise<PostedMenu | { readonly error: string }> {
  const invalid = validateStyle(style, options);
  if (invalid) return { error: invalid };

  const card = buildRoleMenuCard(group, options, style);
  let message: Message;
  try {
    message = await channel.send(cardCreateOptions(card));
  } catch (error) {
    services.observability?.logger?.warn?.("role menu post failed", {
      guildId: guild.id,
      groupId: group.id,
      channelId: channel.id,
      error,
    });
    return { error: "I could not send the role menu in that channel." };
  }

  if (style === "reactions") {
    for (const emoji of reactionEmojis(options)) {
      await message.react(emoji).catch((error: unknown) => {
        services.observability?.logger?.warn?.(
          "role menu reaction add failed",
          {
            guildId: guild.id,
            groupId: group.id,
            messageId: message.id,
            emoji,
            error,
          },
        );
      });
    }
  }

  try {
    await services.db.prisma.roleMenuMessage.create({
      data: {
        guildId: guild.id,
        groupId: group.id,
        channelId: channel.id,
        messageId: message.id,
        style,
      },
    });
  } catch (error) {
    services.observability?.logger?.warn?.("role menu message record failed", {
      guildId: guild.id,
      groupId: group.id,
      messageId: message.id,
      error,
    });
    await message.delete().catch(() => undefined);
    return { error: "I could not save the role menu message." };
  }

  return { channelId: channel.id, messageId: message.id };
}

export async function refreshRoleMenuMessage(
  services: ModuleServices,
  _guild: Guild,
  group: MenuGroup,
  options: readonly MenuOption[],
  record: {
    readonly id: string;
    readonly channelId: string;
    readonly messageId: string;
    readonly style: string;
  },
): Promise<"refreshed" | "deleted" | "skipped"> {
  const channel = await services.client.channels
    .fetch(record.channelId)
    .catch(() => null);
  if (!isReadable(channel)) {
    await services.db.prisma.roleMenuMessage.delete({
      where: { id: record.id },
    });
    return "deleted";
  }

  const message = await channel.messages
    .fetch(record.messageId)
    .catch(() => null);
  if (!message) {
    await services.db.prisma.roleMenuMessage.delete({
      where: { id: record.id },
    });
    return "deleted";
  }

  const style: RoleMenuStyle =
    record.style === "select" || record.style === "reactions"
      ? record.style
      : "buttons";
  if (validateStyle(style, options)) return "skipped";

  const card = buildRoleMenuCard(group, options, style);
  await message.edit(cardMessage(card));

  if (style === "reactions") {
    const botId = services.client.user?.id;
    if (botId) {
      for (const reaction of message.reactions.cache.values()) {
        await reaction.users.remove(botId).catch(() => undefined);
      }
    }
    for (const emoji of reactionEmojis(options)) {
      await message.react(emoji).catch(() => undefined);
    }
  }

  return "refreshed";
}

export async function deleteRoleMenuMessage(
  services: ModuleServices,
  record: { readonly channelId: string; readonly messageId: string },
): Promise<void> {
  const channel = await services.client.channels
    .fetch(record.channelId)
    .catch(() => null);
  if (!isReadable(channel)) return;
  const message = await channel.messages
    .fetch(record.messageId)
    .catch(() => null);
  await message?.delete().catch(() => undefined);
}

export function postSuccessCard(
  group: MenuGroup,
  style: RoleMenuStyle,
  channelId: string,
  messageId: string,
  guildId: string,
): CardReply {
  return makeSuccessCard(`🎭 ${group.name}`, [
    `Posted a **${style}** menu in <#${channelId}>.`,
    `[Open message](https://discord.com/channels/${guildId}/${channelId}/${messageId})`,
  ]);
}

export function reactionForOption(
  options: readonly MenuOption[],
  emoji: { readonly id?: string | null; readonly name?: string | null },
): MenuOption | null {
  const assigned = reactionEmojis(options);
  const index = assigned.findIndex((value) =>
    reactionMatchesEmoji(value, emoji),
  );
  return index >= 0 ? (options[index] ?? null) : null;
}

export function missingChannelCard(): CardReply {
  return makeErrorCard(
    "Channel Unavailable",
    "I cannot send messages in that channel.",
  );
}

export type { SendableChannel };
