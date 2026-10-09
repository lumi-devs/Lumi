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

  createVoice(guildId: string, name: string, options: { parentId?: string; reason?: string } = {}): Promise<{ id: string }> {
    return call("discord.channels.create", { guildId, name, type: "voice", ...options });
  },

  createText(guildId: string, name: string, options: { parentId?: string; reason?: string } = {}): Promise<{ id: string }> {
    return call("discord.channels.create", { guildId, name, type: "text", ...options });
  },

  remove(channelId: string, reason?: string): Promise<void> {
    return call("discord.channels.remove", { channelId, reason });
  },

  setPermissions(channelId: string, targetId: string, perms: { allow?: string[]; deny?: string[] }): Promise<void> {
    return call("discord.channels.permissions", { channelId, targetId, ...perms });
  },
};

export interface FetchedMessage extends SentMessage {
  content: string;
  repliedToId: string | null;
  attachments: { id: string; url: string; contentType: string | null; size: number }[];
}

export const messages = {
  fetch(channelId: string, messageId: string): Promise<FetchedMessage | null> {
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

  move(guildId: string, userId: string, channelId: string): Promise<void> {
    return call("discord.members.move", { guildId, userId, channelId });
  },

  timeout(guildId: string, userId: string, durationMs: number | null, reason?: string): Promise<void> {
    return call("discord.members.timeout", { guildId, userId, durationMs, reason });
  },
};

export interface RoleInfo {
  id: string;
  name: string;
  color: string;
  mentionable: boolean;
  managed: boolean;
  position: number;
}

export const roles = {
  create(guildId: string, options: { name: string; color?: string; mentionable?: boolean; reason?: string }): Promise<{ id: string }> {
    return call("discord.roles.create", { guildId, ...options });
  },

  edit(guildId: string, roleId: string, options: { name?: string; color?: string | null; mentionable?: boolean; reason?: string }): Promise<{ id: string }> {
    return call("discord.roles.edit", { guildId, roleId, ...options });
  },

  remove(guildId: string, roleId: string, reason?: string): Promise<void> {
    return call("discord.roles.remove", { guildId, roleId, reason });
  },

  fetch(guildId: string, roleId: string): Promise<RoleInfo | null> {
    return call("discord.roles.fetch", { guildId, roleId });
  },
};

export const emoji = {
  create(guildId: string, name: string, attachment: string, reason?: string): Promise<{ id: string }> {
    return call("discord.emoji.create", { guildId, name, attachment, reason });
  },
};

export interface StickerInfo {
  id: string;
  name: string;
  tags: string;
  url: string;
}

export const stickers = {
  create(
    guildId: string,
    name: string,
    attachment: string,
    options: { tags?: string; description?: string; reason?: string } = {},
  ): Promise<{ id: string }> {
    return call("discord.stickers.create", { guildId, name, attachment, ...options });
  },

  fetch(guildId: string, stickerId: string): Promise<StickerInfo | null> {
    return call("discord.stickers.fetch", { guildId, stickerId });
  },
};

export const voiceChannels = {
  members(channelId: string): Promise<string[]> {
    return call("discord.channels.members", { channelId });
  },
};

export const threads = {
  create(channelId: string, name: string, options: { messageId?: string; autoArchiveMinutes?: number } = {}): Promise<{ id: string }> {
    return call("discord.threads.create", { channelId, name, ...options });
  },

  archive(threadId: string, locked?: boolean): Promise<void> {
    return call("discord.threads.archive", { threadId, locked });
  },

  remove(threadId: string): Promise<void> {
    return call("discord.threads.remove", { threadId });
  },
};

export const presence = {
  set(options: { status?: "online" | "idle" | "dnd" | "invisible"; activities?: { name: string; type?: number; state?: string; url?: string }[] }): Promise<void> {
    return call("discord.client.presence", options);
  },
};

export function clientStats(): Promise<{ guilds: number; users: number }> {
  return call("discord.client.stats", {});
}

export const modules = {
  enabled(guildId: string, names: string[]): Promise<Record<string, boolean>> {
    return call("modules.enabled", { guildId, names });
  },
};

export interface PrimaryGuildInfo {
  identityGuildId: string | null;
  identityEnabled: boolean | null;
  tag: string | null;
}

export const guilds = {
  get(guildId: string): Promise<{ id: string; name: string; memberCount: number | null } | null> {
    return call("discord.guilds.get", { guildId });
  },

  fetchMember(guildId: string, userId: string): Promise<{ id: string; roles: string[]; premiumSince: number | null; primaryGuild: PrimaryGuildInfo | null } | null> {
    return call("discord.guilds.members.fetch", { guildId, userId });
  },
};
