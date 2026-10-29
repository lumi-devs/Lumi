import {
  type CommandDefinition,
  defineModule,
  type ListenerDefinition,
  type ModuleDefinition,
} from "@lumi/module-kit";
import {
  AccentColors,
  type CardReply,
  ephemeralCard,
  makeCard,
  makeErrorCard,
  makeSuccessCard,
} from "@lumi/ui";
import {
  type Message,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type VoiceState,
} from "discord.js";
import { z } from "zod";

import { isIgnored, sendLog } from "./services.js";

const LoggingConfigSchema = z.object({
  messageLogChannel: z.string().nullable().optional(),
  editLogChannel: z.string().nullable().optional(),
  deleteLogChannel: z.string().nullable().optional(),
  voiceLogChannel: z.string().nullable().optional(),
  ignoredChannels: z.array(z.string(), {}).default([]),
}, {});

type LoggingConfig = z.infer<typeof LoggingConfigSchema>;

const LoggingConfigKey = "logging";

function eventCard(title: string, color: number, lines: string[], footer?: string): CardReply {
  return makeCard(color, title, lines, footer ? { footer } : undefined);
}

function isLoggingEnabled(services: any, guildId: string): boolean {
  return services.modules?.isEnabled(guildId, LoggingConfigKey) ?? true;
}

async function getLoggingConfig(services: any, guildId: string): Promise<LoggingConfig> {
  return ((await services.config.get(guildId, LoggingConfigKey)) ?? {}) as LoggingConfig;
}

const loggingConfigDef: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("logging")
    .setDescription("Configure logging channels")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(s => s.setName("set").setDescription("Set a log channel")
      .addStringOption(o => o.setName("type").setDescription("Log type").setRequired(true).addChoices(
        { name: "Message", value: "message" },
        { name: "Edit", value: "edit" },
        { name: "Delete", value: "delete" },
        { name: "Voice", value: "voice" }
      ))
      .addChannelOption(o => o.setName("channel").setDescription("Channel to log to").setRequired(true))
    )
    .addSubcommand(s => s.setName("remove").setDescription("Remove a log channel")
      .addStringOption(o => o.setName("type").setDescription("Log type").setRequired(true).addChoices(
        { name: "Message", value: "message" },
        { name: "Edit", value: "edit" },
        { name: "Delete", value: "delete" },
        { name: "Voice", value: "voice" }
      ))
    )
    .addSubcommand(s => s.setName("ignore").setDescription("Ignore a channel").addChannelOption(o => o.setName("channel").setDescription("Channel").setRequired(true)))
    .addSubcommand(s => s.setName("unignore").setDescription("Unignore a channel").addChannelOption(o => o.setName("channel").setDescription("Channel").setRequired(true)))
    .addSubcommand(s => s.setName("view").setDescription("View current settings")),
  requiredPermit: "admin.config",
  async execute(interaction, services) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId!;
    const config = (await getLoggingConfig(services, guildId)) as any;

    switch (sub) {
      case "set": {
        const type = interaction.options.getString("type", true);
        const channel = interaction.options.getChannel("channel", true);
        if (!channel || !("guildId" in channel)) {
          await interaction.reply(ephemeralCard(makeErrorCard("Invalid channel", "Must be a guild text channel")));
          return;
        }
        const key = `${type}LogChannel`;
        config[key] = channel.id;
        await services.config.set(guildId, LoggingConfigKey, config);
        await interaction.reply(ephemeralCard(makeSuccessCard("Log channel set", [
          `**Type**\n${type}`,
          `**Channel**\n${channel}`,
        ])));
        break;
      }
      case "remove": {
        const type = interaction.options.getString("type", true);
        const key = `${type}LogChannel`;
        delete config[key];
        await services.config.set(guildId, LoggingConfigKey, config);
        await interaction.reply(ephemeralCard(makeSuccessCard("Log channel removed", [
          `**Type**\n${type}`,
        ])));
        break;
      }
      case "ignore": {
        const channel = interaction.options.getChannel("channel", true);
        if (!channel || !("guildId" in channel)) {
          await interaction.reply(ephemeralCard(makeErrorCard("Invalid channel", "Must be a guild channel")));
          return;
        }
        config.ignoredChannels = config.ignoredChannels ?? [];
        if (!config.ignoredChannels.includes(channel.id)) config.ignoredChannels.push(channel.id);
        await services.config.set(guildId, LoggingConfigKey, config);
        await interaction.reply(ephemeralCard(makeSuccessCard("Channel ignored", [
          `**Channel**\n${channel}`,
        ])));
        break;
      }
      case "unignore": {
        const channel = interaction.options.getChannel("channel", true);
        if (!channel || !("guildId" in channel)) {
          await interaction.reply(ephemeralCard(makeErrorCard("Invalid channel", "Must be a guild channel")));
          return;
        }
        config.ignoredChannels = (config.ignoredChannels ?? []).filter((id: string) => id !== channel.id);
        await services.config.set(guildId, LoggingConfigKey, config);
        await interaction.reply(ephemeralCard(makeSuccessCard("Channel unignored", [
          `**Channel**\n${channel}`,
        ])));
        break;
      }
      case "view": {
        const ignored = (config.ignoredChannels ?? []).map((id: string) => `<#${id}>`).join(", ") || "None";
        await interaction.reply(ephemeralCard(makeCard(
          undefined,
          "📝 Logging Settings",
          [
            `**Message Log**\n${config.messageLogChannel ? `<#${config.messageLogChannel}>` : "None"}`,
            `**Edit Log**\n${config.editLogChannel ? `<#${config.editLogChannel}>` : "None"}`,
            `**Delete Log**\n${config.deleteLogChannel ? `<#${config.deleteLogChannel}>` : "None"}`,
            `**Voice Log**\n${config.voiceLogChannel ? `<#${config.voiceLogChannel}>` : "None"}`,
            `**Ignored Channels**\n${ignored}`,
          ],
          { footer: "Use /logging set to configure a channel" },
        )));
        break;
      }
    }
  },
};

const onMessageCreateListener: ListenerDefinition = {
  event: "messageCreate",
  async handler(message: Message, services: any) {
    if (!message.inGuild() || message.author.bot) return;

    const guildId = message.guildId;
    if (!isLoggingEnabled(services, guildId)) return;
    const config = await getLoggingConfig(services, guildId);

    if (isIgnored(message, config)) return;

    const card = eventCard("📨 Message Sent", AccentColors.success, [
      `**Author**\n${message.author.tag} (\`${message.author.id}\`)`,
      `**Channel**\n<#${message.channelId}>`,
      `**Content**\n${message.content.slice(0, 1024) || "*No content*"}`,
    ], `Message ID: ${message.id}`);

    await sendLog(services, config.messageLogChannel, card);
  },
};

const onMessageUpdateListener: ListenerDefinition = {
  event: "messageUpdate",
  async handler(oldMessage: Message, newMessage: Message, services: any) {
    if (!newMessage.inGuild() || newMessage.author.bot) return;
    if (oldMessage.content === newMessage.content) return;

    const guildId = newMessage.guildId;
    if (!isLoggingEnabled(services, guildId)) return;
    const config = await getLoggingConfig(services, guildId);

    if (isIgnored(newMessage, config)) return;

    const card = eventCard("✏️ Message Edited", AccentColors.warning, [
      `**Author**\n${newMessage.author.tag} (\`${newMessage.author.id}\`)`,
      `**Channel**\n<#${newMessage.channelId}>`,
      `**Before**\n${(oldMessage.content ?? "").slice(0, 512) || "*No content*"}`,
      `**After**\n${(newMessage.content ?? "").slice(0, 512) || "*No content*"}`,
    ], `Message ID: ${newMessage.id}`);

    await sendLog(services, config.editLogChannel, card);
  },
};

const onMessageDeleteListener: ListenerDefinition = {
  event: "messageDelete",
  async handler(message: Message, services: any) {
    if (!message.inGuild() || message.author.bot) return;

    const guildId = message.guildId!;
    if (!isLoggingEnabled(services, guildId)) return;
    const config = await getLoggingConfig(services, guildId);

    if (isIgnored(message, config)) return;

    const card = eventCard("🗑️ Message Deleted", AccentColors.error, [
      `**Author**\n${message.author.tag} (\`${message.author.id}\`)`,
      `**Channel**\n<#${message.channelId}>`,
      `**Content**\n${(message.content ?? "").slice(0, 1024) || "*No content*"}`,
    ], `Message ID: ${message.id}`);

    await sendLog(services, config.deleteLogChannel, card);
  },
};

const onVoiceStateListener: ListenerDefinition = {
  event: "voiceStateUpdate",
  async handler(oldState: VoiceState, newState: VoiceState, services: any) {
    const guildId = newState.guild?.id ?? oldState.guild?.id;
    if (!guildId) return;

    if (!isLoggingEnabled(services, guildId)) return;
    const config = await getLoggingConfig(services, guildId);
    if (!config.voiceLogChannel) return;

    const member = newState.member ?? oldState.member;
    if (!member) return;

    if (!oldState.channelId && newState.channelId) {
      await sendLog(services, config.voiceLogChannel, eventCard("🔊 Voice Join", AccentColors.success, [
        `**User**\n${member.user.tag} (\`${member.id}\`)`,
        `**Channel**\n<#${newState.channelId}>`,
      ], `User ID: ${member.id}`));
    } else if (oldState.channelId && !newState.channelId) {
      await sendLog(services, config.voiceLogChannel, eventCard("🔇 Voice Leave", AccentColors.error, [
        `**User**\n${member.user.tag} (\`${member.id}\`)`,
        `**Channel**\n<#${oldState.channelId}>`,
      ], `User ID: ${member.id}`));
    } else if (oldState.channelId !== newState.channelId) {
      await sendLog(services, config.voiceLogChannel, eventCard("🔄 Voice Move", AccentColors.cyan, [
        `**User**\n${member.user.tag} (\`${member.id}\`)`,
        `**From**\n<#${oldState.channelId}>`,
        `**To**\n<#${newState.channelId}>`,
      ], `User ID: ${member.id}`));
    }
  },
};

const loggingModule: ModuleDefinition = defineModule({
  name: "logging-logs",
  displayName: "Logging",
  emoji: "📝",
  description: "Message, edit, delete, voice, and moderation logging",
  version: "2.0.0",
  config: LoggingConfigSchema,
  commands: [loggingConfigDef],
  listeners: [onMessageCreateListener, onMessageUpdateListener, onMessageDeleteListener, onVoiceStateListener],
  tasks: [],
  async onLoad(_services) {
    console.log("[logging] Module loaded");
    return [];
  },
  async onUnload(_services) {
    console.log("[logging] Module unloaded");
  },
});

export default loggingModule;
