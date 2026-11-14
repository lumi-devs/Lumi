import type { Guild, Message } from "discord.js";

const MessageLinkPattern =
  /^https?:\/\/(?:www\.|ptb\.|canary\.)?discord(?:app)?\.com\/channels\/(\d+)\/(\d+)\/(\d+)(?:\?.*)?$/i;
const SnowflakePattern = /^\d{15,20}$/;
const QuoteInvocationNames: Record<string, true> = {
  quote: true,
  q: true,
};

export interface QuoteMessageReference {
  guildId: string | null;
  channelId: string | null;
  messageId: string;
}

export function parseMessageReference(
  value: string,
): QuoteMessageReference | null {
  const trimmed = value.trim();
  const link = MessageLinkPattern.exec(trimmed);
  if (link) {
    return {
      guildId: link[1]!,
      channelId: link[2]!,
      messageId: link[3]!,
    };
  }
  if (SnowflakePattern.test(trimmed)) {
    return { guildId: null, channelId: null, messageId: trimmed };
  }
  return null;
}

export function extractQuoteText(message: Message): string {
  const content = message.content.trim();
  if (content.length > 0) return content;

  const attachments = [...message.attachments.values()]
    .map((attachment) => attachment.url)
    .filter((url) => url.length > 0);
  if (attachments.length > 0) return attachments.join("\n");

  const embeds = message.embeds
    .map((embed) =>
      [embed.title, embed.description].filter(Boolean).join("\n").trim(),
    )
    .filter((value) => value.length > 0);
  if (embeds.length > 0) return embeds.join("\n");

  return "";
}

const UserMentionPattern = /<@!?(\d+)>/g;
const RoleMentionPattern = /<@&(\d+)>/g;
const ChannelMentionPattern = /<#(\d+)>/g;

export function resolveTextMentions(text: string, guild: Guild | null): string {
  if (!guild) return text;

  return text
    .replace(UserMentionPattern, (_, id: string) => {
      const member = guild.members?.cache?.get(id);
      return member ? `@${member.displayName}` : `@${id}`;
    })
    .replace(RoleMentionPattern, (_, id: string) => {
      const role = guild.roles?.cache?.get(id);
      return role ? `@${role.name}` : `@${id}`;
    })
    .replace(ChannelMentionPattern, (_, id: string) => {
      const channel = guild.channels?.cache?.get(id);
      return channel && "name" in channel && channel.name
        ? `#${channel.name}`
        : `#${id}`;
    });
}

export function stripQuoteInvocation(content: string, prefix: string): string {
  const trimmed = content.trim();
  if (!prefix || !trimmed.startsWith(prefix)) return "";

  const rest = trimmed.slice(prefix.length).trimStart();
  const [name, ...args] = rest.split(/\s+/);
  if (!name || QuoteInvocationNames[name.toLowerCase()] !== true) return "";

  return args.join(" ").trim();
}
