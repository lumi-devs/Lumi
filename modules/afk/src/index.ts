import {
  SlashCommandBuilder,
  Message,
  GuildMember,
  APIInteractionGuildMember,
} from "discord.js";
import { defineModule, type CommandDefinition, type ModuleDefinition, type ListenerDefinition } from "@lumi/module-kit";
import { makeErrorCard, makeInfoCard, makeSuccessCard, ephemeralCard } from "@lumi/ui";
import { z } from "zod";

function isGuildMember(member: GuildMember | APIInteractionGuildMember | null | undefined): member is GuildMember {
  return member !== null && member !== undefined && "displayName" in member && "setNickname" in member;
}

const AfkConfigSchema = z.object({
  nickPrefixEnabled: z.boolean().default(true),
  nickPrefix: z.string().default("[AFK] "),
  mentionReply: z.boolean().default(true),
  maxReasonLength: z.number().int().min(1).max(500).default(200),
});

const afkDef: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("afk")
    .setDescription("Set yourself as AFK")
    .addStringOption(o => o.setName("reason").setDescription("AFK reason").setRequired(false).setMaxLength(200)),
  async execute(interaction, services) {
    const reason = interaction.options.getString("reason") ?? "No reason provided";
    const guildId = interaction.guildId!;
    const config = await services.config.get(guildId, "afk") as any ?? {};
    const limit = config.maxReasonLength ?? 200;

    if (reason.length > limit) {
      await interaction.reply(ephemeralCard(makeErrorCard("Reason too long", [
        `**Limit** — ${limit} characters`,
        `**Your reason** — ${reason.length} characters`,
      ])));
      return;
    }

    await services.db.prisma.afkEntry.upsert({
      where: { guildId_userId: { guildId, userId: interaction.user.id } },
      update: { reason, createdAt: new Date() },
      create: { guildId, userId: interaction.user.id, reason },
    });

    const member = interaction.member;
    if (isGuildMember(member) && config.nickPrefixEnabled && !member.displayName.startsWith(config.nickPrefix ?? "[AFK] ")) {
      try {
        await member.setNickname(`${config.nickPrefix ?? "[AFK] "}${member.displayName}`, "AFK");
      } catch {}
    }

    const body = [
      `**Reason** — ${reason}`,
      "You are marked AFK. Your status clears when you send a message or use `/unafk`.",
    ];
    if (isGuildMember(member) && config.nickPrefixEnabled) {
      body.push(`**Nickname prefix** — ${config.nickPrefix ?? "[AFK] "}`);
    }

    await interaction.reply(ephemeralCard(makeSuccessCard("AFK enabled", body, {
      subtitle: interaction.guild?.name,
      footer: "AFK status",
    })));
  },
};

const unafkDef: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("unafk")
    .setDescription("Remove your AFK status"),
  async execute(interaction, services) {
    const guildId = interaction.guildId!;
    const config = await services.config.get(guildId, "afk") as any ?? {};

    const deleted = await services.db.prisma.afkEntry.delete({
      where: { guildId_userId: { guildId, userId: interaction.user.id } },
    }).catch(() => null);

    if (!deleted) {
      await interaction.reply(ephemeralCard(makeInfoCard("Not AFK", "You do not have an active AFK status.")));
      return;
    }

    const member = interaction.member;
    if (isGuildMember(member) && config.nickPrefixEnabled && member.displayName.startsWith(config.nickPrefix ?? "[AFK] ")) {
      try {
        await member.setNickname(member.displayName.slice((config.nickPrefix ?? "[AFK] ").length), "No longer AFK");
      } catch {}
    }

    await interaction.reply(ephemeralCard(makeSuccessCard("Welcome back", "Your AFK status has been removed.")));
  },
};

const onMessageListener: ListenerDefinition = {
  event: "messageCreate",
  async handler(message: Message, services: any) {
    if (!message.inGuild() || message.author.bot) return;

    const guildId = message.guildId;
    const config = await services.config.get(guildId, "afk") as any ?? {};

    if (!services.db.prisma.afkEntry) return;
    const authorAfk = await services.db.prisma.afkEntry.findUnique({
      where: { guildId_userId: { guildId, userId: message.author.id } },
    });

    if (authorAfk) {
      await services.db.prisma.afkEntry.delete({
        where: { guildId_userId: { guildId, userId: message.author.id } },
      }).catch(() => {});

      const member = message.member;
      if (isGuildMember(member) && config.nickPrefixEnabled && member.displayName.startsWith(config.nickPrefix ?? "[AFK] ")) {
        try {
          await member.setNickname(member.displayName.slice((config.nickPrefix ?? "[AFK] ").length), "No longer AFK");
        } catch {}
      }

      await message.reply(makeSuccessCard("Welcome back", "Your AFK status has been removed automatically.")).catch(() => {});
    }

    if (!config.mentionReply) return;

    for (const user of message.mentions.users.values()) {
      if (user.bot) continue;

      const afk = await services.db.prisma.afkEntry.findUnique({
        where: { guildId_userId: { guildId, userId: user.id } },
      });

      if (afk) {
        const target = message.guild?.members.cache.get(user.id);
        const displayName = target?.displayName ?? user.tag;
        await message.reply(makeInfoCard("User is AFK", [
          `**${displayName}** is currently AFK.`,
          `**Reason** — ${afk.reason}`,
        ], {
          subtitle: message.guild?.name,
          footer: "They will see your message when they return.",
        })).catch(() => {});
        break;
      }
    }
  },
};

const afkModule: ModuleDefinition = defineModule({
  name: "afk",
  displayName: "AFK",
  emoji: "💤",
  description: "Set AFK status with mention replies and nickname prefix",
  version: "2.0.0",
  config: AfkConfigSchema,
  configFields: [
    { key: "nickPrefixEnabled", label: "Nickname Prefix", type: "boolean", description: "Prefix nickname when AFK" },
    { key: "nickPrefix", label: "Prefix Text", type: "string", description: "Text to prepend to nickname" },
    { key: "mentionReply", label: "Mention Reply", type: "boolean", description: "Reply when mentioned while AFK" },
    { key: "maxReasonLength", label: "Max Reason Length", type: "number", description: "Maximum AFK reason length" },
  ],
  commands: [afkDef, unafkDef],
  listeners: [onMessageListener],
  tasks: [],
  async onLoad(services) {
    console.log("[afk] Module loaded");
    return [];
  },
  async onUnload(services) {
    console.log("[afk] Module unloaded");
  },
});

export default afkModule;
