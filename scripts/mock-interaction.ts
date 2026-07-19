import { container } from "@sapphire/framework";
import { CommandContext } from "../packages/core/src/lib/command-context.js";
import type { ChatInputCommandInteraction } from "discord.js";
import { EventEmitter } from "events";

export async function runMockedCommand(client: any, commandName: string, options: Record<string, any> = {}) {
  const commands = container.stores.get("commands");
  const command = commands.get(commandName) as any;
  if (!command) throw new Error(`Command ${commandName} not found`);

  let replyData: any = null;

  class MockMessage extends EventEmitter {
    resource: any = { message: this };
    edit(data: any) { replyData = data; return this; }
    createMessageComponentCollector() {
      const collector = new EventEmitter() as any;
      collector.stop = () => {};
      return collector;
    }
  }
  const mockMessage = new MockMessage();
  const mockUser = { id: "1234567890", tag: "mock#0000", bot: false, displayAvatarURL: () => "http://example.com/avatar.png", bannerURL: () => null, fetch: async () => mockUser, avatar: true };
  const mockMember = { 
    id: "1234567890",
    roles: { cache: { filter: () => [], map: () => [] } }, 
    client: client, 
    user: mockUser,
    guild: { id: "test-guild-id", iconURL: () => "http://example.com/icon.png" },
    displayAvatarURL: () => "http://example.com/avatar.png",
    permissions: { has: () => false },
    voice: { channel: { id: "mock-voice-channel" } }
  };

  const mockInteraction = {
    isChatInputCommand: () => true,
    isCommand: () => true,
    deferred: false,
    replied: false,
    client: client,
    user: mockUser,
    member: mockMember,
    guild: { 
      id: "test-guild-id", 
      name: "Test Guild", 
      client: client,
      members: { fetch: async () => mockMember, cache: { filter: () => [], size: 1 } },
      roles: { fetch: async () => new Map(), cache: { filter: () => [], size: 1, sort: () => [] } },
      channels: { fetch: async () => new Map(), cache: { filter: () => [], size: 1 } },
      emojis: { cache: { size: 0 } },
      stickers: { cache: { size: 0 } },
      premiumSubscriptionCount: 0,
      createdAt: new Date(),
      fetchOwner: async () => mockMember,
      ownerId: "1234567890",
      iconURL: () => "http://example.com/icon.png"
    },
    guildId: "test-guild-id",
    channelId: "test-channel-id",
    deferReply: async () => { mockInteraction.deferred = true; return mockMessage; },
    editReply: async (data: any) => { replyData = data; mockInteraction.replied = true; return mockMessage; },
    reply: async (data: any) => { replyData = data; mockInteraction.replied = true; return mockMessage; },
    fetchReply: async () => mockMessage,
    showModal: async (data: any) => { replyData = data; mockInteraction.replied = true; return mockMessage; },
    options: {
      getString: (n: string) => options[n] ?? "mock string",
      getInteger: (n: string) => options[n] ?? 1,
      getNumber: (n: string) => options[n] ?? 1,
      getBoolean: (n: string) => options[n] ?? true,
      getUser: (n: string) => options[n] ?? mockUser,
      getMember: (n: string) => options[n] ?? mockMember,
      getRole: (n: string) => options[n] ?? { id: "role-id", name: "mock role" },
      getChannel: (n: string) => options[n] ?? { id: "channel-id", name: "mock channel" },
      getSubcommand: () => options['subcommand'] ?? null,
      getSubcommandGroup: () => options['subcommandGroup'] ?? null,
    }
  } as unknown as ChatInputCommandInteraction;

  try {
    if (command.chatInputRun) {
      await command.chatInputRun(mockInteraction);
    } else {
      throw new Error(`Command ${commandName} does not have chatInputRun`);
    }
    return { success: true, replyData };
  } catch (err) {
    return { success: false, error: err };
  }
}
