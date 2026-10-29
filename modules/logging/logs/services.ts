import type { CardReply } from "@lumi/ui";
import type { Message } from "discord.js";

interface LoggingConfig {
  messageLogChannel?: string | null;
  editLogChannel?: string | null;
  deleteLogChannel?: string | null;
  voiceLogChannel?: string | null;
  ignoredChannels?: string[] | null;
}

export async function sendLog(services: any, channelId: string | null | undefined, card: CardReply) {
  if (!channelId) return;

  const channel = services.client.channels.cache.get(channelId);
  if (channel?.isTextBased()) {
    try {
      await channel.send(card);
    } catch (e) {
      console.error("Failed to send log:", e);
    }
  }
}

export function isIgnored(message: Message, config: LoggingConfig): boolean {
  return config.ignoredChannels?.includes(message.channelId) ?? false;
}
