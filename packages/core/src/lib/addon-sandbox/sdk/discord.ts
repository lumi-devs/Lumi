import type { CardReply } from "#lib/utilities/cards.js";
import { call } from "./rpc.js";

export type MessagePayload = CardReply | { content?: string; components?: unknown[] };

export interface SentMessage {
  id: string;
  channelId: string;
}

export const channels = {
  send(channelId: string, payload: MessagePayload): Promise<SentMessage> {
    return call("discord.channels.send", { channelId, payload });
  },
};

export const messages = {
  fetch(
    channelId: string,
    messageId: string,
  ): Promise<(SentMessage & { content: string }) | null> {
    return call("discord.messages.fetch", { channelId, messageId });
  },

  edit(channelId: string, messageId: string, payload: MessagePayload): Promise<SentMessage> {
    return call("discord.messages.edit", { channelId, messageId, payload });
  },
};
