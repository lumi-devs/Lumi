import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  Message,
  VoiceState,
} from "discord.js";
import {
  defineModule,
  type CommandDefinition,
  type ListenerDefinition,
  type ModuleDefinition,
} from "@lumi/module-kit";
import {
  BrandColors,
  ephemeralCard,
  makeCard,
  makeErrorCard,
  makeSuccessCard,
  type CardReply,
} from "@lumi/ui";
import { z } from "zod";

import { sendLog, isIgnored } from "./services.js";

const LoggingConfigSchema = z.object({
  messageLogChannel: z.string().nullable().optional(),
  editLogChannel: z.string().nullable().optional(),
  deleteLogChannel: z.string().nullable().optional(),
  voiceLogChannel: z.string().nullable().optional(),
  modLogChannel: z.string().nullable().optional(),
  ignoredChannels: z.array(z.string()).default([]),
  webhookUrl: z.string().nullable().optional(),
});

type LoggingConfig = z.infer<typeof LoggingConfigSchema>;

function eventCard(title: string, color: number, lines: string[], footer?: string): CardReply {
  return makeCard(color, title, lines, footer ? { footer } : undefined);
}

function isLoggingEnabled(services: any, guildId: string): boolean {
  return services.modules?.isEnabled(guildId, "logging") ?? true;
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
        { name: "Voice", value: "voice" },
        { name: "Mod", value: "mod" }
      ))
      .addChannelOption(o => o.setName("channel").setDescription("Channel to log to").setRequired(true))
    )
    .addSubcommand(s => s.setName("remove").setDescription("Remove a log channel")
      .addStringOption(o => o.setName("type").setDescription("Log type").setRequired(true).addChoices(
        { name: "Message", value: "message" },
        { name: "Edit", value: "edit" },
        { name: "Delete", value: "delete" },
        { name: "Voice", value: "voice" },
        { name: "Mod", value: "mod" }
      ))
    )
    .addSubcommand(s => s.setName("ignore").setDescription("Ignore a channel").addChannelOption(o => o.setName("channel").setDescription("Channel").setRequired(true)))
    .addSubcommand(s => s.setName("unignore").setDescription("Unignore a channel").addChannelOption(o => o.setName("channel").setDescription("Channel").setRequired(true)))
    .addSubcommand(s => s.setName("view").setDescription("View current settings")),
  requiredPermit: "admin.config",
  async execute(interaction, services) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId!;
    const config = await services.config.get(guildId, "logging") as any ?? {};

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
        await services.config.set(guildId, "logging", config);
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
        await services.config.set(guildId, "logging", config);
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
        await services.config.set(guildId, "logging", config);
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
        await services.config.set(guildId, "logging", config);
        await interaction.reply(ephemeralCard(makeSuccessCard("Channel unignored", [
          `**Channel**\n${channel}`,
        ])));
        break;
      }
      case "view": {
        const ignored = (config.ignoredChannels ?? []).map((id: string) => `<#${id}>`).join(", ") || "None";
        await interaction.reply(ephemeralCard(makeCard(
          BrandColors.primary,
          "📝 Logging Settings",
          [
            `**Message Log**\n${config.messageLogChannel ? `<#${config.messageLogChannel}>` : "None"}`,
            `**Edit Log**\n${config.editLogChannel ? `<#${config.editLogChannel}>` : "None"}`,
            `**Delete Log**\n${config.deleteLogChannel ? `<#${config.deleteLogChannel}>` : "None"}`,
            `**Voice Log**\n${config.voiceLogChannel ? `<#${config.voiceLogChannel}>` : "None"}`,
            `**Mod Log**\n${config.modLogChannel ? `<#${config.modLogChannel}>` : "None"}`,
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
    const config = (await services.config.get(guildId, "logging") ?? {}) as LoggingConfig;
    if (!isLoggingEnabled(services, guildId)) return;

    if (isIgnored(message, config)) return;

    const card = eventCard("📨 Message Sent", BrandColors.success, [
      `**Author**\n${message.author.tag} (\`${message.author.id}\`)`,
      `**Channel**\n<#${message.channelId}>`,
      `**Content**\n${message.content.slice(0, 1024) || "*No content*"}`,
    ], `Message ID: ${message.id}`);

    await sendLog(services, guildId, config.messageLogChannel, card);
  },
};

const onMessageUpdateListener: ListenerDefinition = {
  event: "messageUpdate",
  async handler(oldMessage: Message, newMessage: Message, services: any) {
    if (!newMessage.inGuild() || newMessage.author.bot) return;
    if (oldMessage.content === newMessage.content) return;

    const guildId = newMessage.guildId;
    const config = (await services.config.get(guildId, "logging") ?? {}) as LoggingConfig;
    if (!isLoggingEnabled(services, guildId)) return;

    if (isIgnored(newMessage, config)) return;

    const card = eventCard("✏️ Message Edited", BrandColors.warning, [
      `**Author**\n${newMessage.author.tag} (\`${newMessage.author.id}\`)`,
      `**Channel**\n<#${newMessage.channelId}>`,
      `**Before**\n${(oldMessage.content ?? "").slice(0, 512) || "*No content*"}`,
      `**After**\n${(newMessage.content ?? "").slice(0, 512) || "*No content*"}`,
    ], `Message ID: ${newMessage.id}`);

    await sendLog(services, guildId, config.editLogChannel, card);
  },
};

const onMessageDeleteListener: ListenerDefinition = {
  event: "messageDelete",
  async handler(message: Message, services: any) {
    if (!message.inGuild() || message.author.bot) return;

    const guildId = message.guildId!;
    const config = (await services.config.get(guildId, "logging") ?? {}) as LoggingConfig;
    if (!isLoggingEnabled(services, guildId)) return;

    if (isIgnored(message, config)) return;

    const card = eventCard("🗑️ Message Deleted", BrandColors.error, [
      `**Author**\n${message.author.tag} (\`${message.author.id}\`)`,
      `**Channel**\n<#${message.channelId}>`,
      `**Content**\n${(message.content ?? "").slice(0, 1024) || "*No content*"}`,
    ], `Message ID: ${message.id}`);

    await sendLog(services, guildId, config.deleteLogChannel, card);
  },
};

const onVoiceStateListener: ListenerDefinition = {
  event: "voiceStateUpdate",
  async handler(oldState: VoiceState, newState: VoiceState, services: any) {
    const guildId = newState.guild?.id ?? oldState.guild?.id;
    if (!guildId) return;

    const config = (await services.config.get(guildId, "logging") ?? {}) as LoggingConfig;
    if (!isLoggingEnabled(services, guildId)) return;
    if (!config.voiceLogChannel) return;

    const member = newState.member ?? oldState.member;
    if (!member) return;

    if (!oldState.channelId && newState.channelId) {
      await sendLog(services, guildId, config.voiceLogChannel, eventCard("🔊 Voice Join", BrandColors.success, [
        `**User**\n${member.user.tag} (\`${member.id}\`)`,
        `**Channel**\n<#${newState.channelId}>`,
      ], `User ID: ${member.id}`));
    } else if (oldState.channelId && !newState.channelId) {
      await sendLog(services, guildId, config.voiceLogChannel, eventCard("🔇 Voice Leave", BrandColors.error, [
        `**User**\n${member.user.tag} (\`${member.id}\`)`,
        `**Channel**\n<#${oldState.channelId}>`,
      ], `User ID: ${member.id}`));
    } else if (oldState.channelId !== newState.channelId) {
      await sendLog(services, guildId, config.voiceLogChannel, eventCard("🔄 Voice Move", BrandColors.cyan, [
        `**User**\n${member.user.tag} (\`${member.id}\`)`,
        `**From**\n<#${oldState.channelId}>`,
        `**To**\n<#${newState.channelId}>`,
      ], `User ID: ${member.id}`));
    }
  },
};

const loggingModule: ModuleDefinition = defineModule({
  name: "logging",
  displayName: "Logging",
  emoji: "📝",
  description: "Message, edit, delete, voice, and moderation logging",
  version: "2.0.0",
  config: LoggingConfigSchema,
  configFields: [
    { key: "messageLogChannel", label: "Message Log Channel", type: "channel", description: "Log message edits/deletes" },
    { key: "editLogChannel", label: "Edit Log Channel", type: "channel", description: "Log message edits" },
    { key: "deleteLogChannel", label: "Delete Log Channel", type: "channel", description: "Log message deletes" },
    { key: "voiceLogChannel", label: "Voice Log Channel", type: "channel", description: "Log voice state changes" },
    { key: "modLogChannel", label: "Mod Log Channel", type: "channel", description: "Log moderation actions" },
    { key: "ignoredChannels", label: "Ignored Channels", type: "multi-channel", description: "Channels to exclude from logging" },
  ],
  commands: [loggingConfigDef],
  listeners: [onMessageCreateListener, onMessageUpdateListener, onMessageDeleteListener, onVoiceStateListener],
  tasks: [],
  async onLoad(services) {
    console.log("[logging] Module loaded");
    return [];
  },
  async onUnload(services) {
    console.log("[logging] Module unloaded");
  },
});

export default loggingModule;
