import type { ModuleServices } from "@lumi/module-kit";
import type { CardReply } from "@lumi/ui";
import type { Message } from "discord.js";
import type { LoggingConfig } from "./config.js";

export async function sendLog(
  services: ModuleServices,
  channelId: string | null | undefined,
  card: CardReply,
): Promise<void> {
  if (!channelId) return;

  const channel = services.client.channels.cache.get(channelId);
  if (
    !channel?.isTextBased() ||
    !("send" in channel) ||
    typeof channel.send !== "function"
  ) {
    return;
  }

  try {
    await channel.send(card);
  } catch (error) {
    services.observability?.logger?.warn?.("log message send failed", {
      channelId,
      error,
    });
  }
}

export function isIgnored(message: Message, config: LoggingConfig): boolean {
  return config.ignoredChannels?.includes(message.channelId) ?? false;
}
