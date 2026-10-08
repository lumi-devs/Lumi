import type { CardReply } from "#lib/ui/cards.js";
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

  remove(channelId: string, messageId: string): Promise<void> {
    return call("discord.messages.delete", { channelId, messageId });
  },
};

export const members = {
  addRole(guildId: string, userId: string, roleId: string): Promise<void> {
    return call("discord.members.roles.add", { guildId, userId, roleId });
  },

  removeRole(guildId: string, userId: string, roleId: string): Promise<void> {
    return call("discord.members.roles.remove", { guildId, userId, roleId });
  },

  timeout(guildId: string, userId: string, durationMs: number | null, reason?: string): Promise<void> {
    return call("discord.members.timeout", { guildId, userId, durationMs, reason });
  },
};

export const modules = {
  enabled(guildId: string, names: string[]): Promise<Record<string, boolean>> {
    return call("modules.enabled", { guildId, names });
  },
};

export const guilds = {
  get(guildId: string): Promise<{ id: string; name: string } | null> {
    return call("discord.guilds.get", { guildId });
  },

  fetchMember(guildId: string, userId: string): Promise<{ id: string; roles: string[]; premiumSince: number | null } | null> {
    return call("discord.guilds.members.fetch", { guildId, userId });
  },
};
