import {
  SlashCommandBuilder,
  type Message,
  type GuildMember,
  type APIInteractionGuildMember,
} from "discord.js";
import {
  defineModule,
  type CommandDefinition,
  type ModuleDefinition,
  type ListenerDefinition,
} from "@lumi/module-kit";
import { ephemeralCard } from "@lumi/ui";
import { z } from "zod";
import {
  buildAfkMentionCard,
  buildAfkRemovalCard,
  buildAfkStatusCard,
  formatAfkDuration,
  sanitizeAfkReason,
} from "./ui.js";

function isGuildMember(
  member: GuildMember | APIInteractionGuildMember | null | undefined,
): member is GuildMember {
  return (
    member !== null &&
    member !== undefined &&
    "displayName" in member &&
    "setNickname" in member
  );
}

const AfkConfigSchema = z.object({
  nickPrefixEnabled: z.boolean().default(true),
  nickPrefix: z.string().default("[AFK] "),
  mentionReply: z.boolean().default(true),
  maxReasonLength: z.number().int().min(1).max(500).default(200),
}, {});

const getAfkConfig = async (services: any, guildId: string) =>
  AfkConfigSchema.parse((await services.config.get(guildId, "afk")) ?? {});

const RemovalCooldownMs = 2000;

const removalCooldownKey = (guildId: string, userId: string): string =>
  `lumi:afk:cd:removal:${guildId}:${userId}`;

const markRemovalCooldown = async (
  services: any,
  guildId: string,
  userId: string,
): Promise<void> => {
  const redis = services?.redis;
  if (!redis || typeof redis.set !== "function") return;
  await redis
    .set(removalCooldownKey(guildId, userId), "1", "PX", RemovalCooldownMs)
    .catch(() => undefined);
};

const isRemovalCooldown = async (
  services: any,
  guildId: string,
  userId: string,
): Promise<boolean> => {
  const redis = services?.redis;
  if (!redis || typeof redis.get !== "function") return false;
  const value = await redis
    .get(removalCooldownKey(guildId, userId))
    .catch(() => null);
  return value !== null && value !== undefined;
};

const stripPrefix = (name: string, prefix: string): string =>
  prefix.length > 0 && name.startsWith(prefix)
    ? name.slice(prefix.length)
    : name;

const afkDef: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("afk")
    .setDescription("Set yourself AFK with an optional reason")
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("The reason for being AFK")
        .setRequired(false)
        .setMaxLength(500),
    ),
  async execute(interaction, services) {
    const guildId = interaction.guildId!;
    const config = await getAfkConfig(services, guildId);
    const rawReason = interaction.options.getString("reason") ?? "AFK";
    const reason = sanitizeAfkReason(rawReason, config.maxReasonLength);

    await markRemovalCooldown(services, guildId, interaction.user.id);

    const existing = await services.db.prisma.afkEntry
      .findUnique({
        where: {
          guildId_userId: { guildId, userId: interaction.user.id },
        },
      })
      .catch(() => null);

    const status = existing
      ? existing.reason === reason
        ? "already"
        : "updated"
      : "set";

    if (status !== "already") {
      await services.db.prisma.afkEntry.upsert({
        where: {
          guildId_userId: { guildId, userId: interaction.user.id },
        },
        update: { reason, createdAt: new Date() },
        create: { guildId, userId: interaction.user.id, reason },
      });
    }

    const member = interaction.member;
    if (
      status === "set" &&
      isGuildMember(member) &&
      config.nickPrefixEnabled &&
      !member.displayName.startsWith(config.nickPrefix)
    ) {
      try {
        await member.setNickname(
          `${config.nickPrefix}${member.displayName}`.slice(0, 32),
          "AFK",
        );
      } catch {}
    }

    await interaction.reply(
      ephemeralCard(buildAfkStatusCard(status, reason)),
    );
  },
};

const onMessageListener: ListenerDefinition = {
  event: "messageCreate",
  async handler(message: Message, services: any) {
    if (!message.inGuild() || message.author.bot) return;

    const guildId = message.guildId;
    const config = await getAfkConfig(services, guildId);

    if (!services.db.prisma.afkEntry) return;
    const authorAfk = await services.db.prisma.afkEntry.findUnique({
      where: {
        guildId_userId: { guildId, userId: message.author.id },
      },
    });

    if (
      authorAfk &&
      !(await isRemovalCooldown(services, guildId, message.author.id))
    ) {
      await services.db.prisma.afkEntry
        .delete({
          where: {
            guildId_userId: { guildId, userId: message.author.id },
          },
        })
        .catch(() => {});

      const member = message.member;
      if (
        isGuildMember(member) &&
        config.nickPrefixEnabled &&
        member.displayName.startsWith(config.nickPrefix)
      ) {
        try {
          await member.setNickname(
            stripPrefix(member.displayName, config.nickPrefix) || null,
            "No longer AFK",
          );
        } catch {}
      }

      const duration = formatAfkDuration(
        Date.now() - new Date(authorAfk.createdAt).getTime(),
      );
      await message
        .reply(buildAfkRemovalCard(duration))
        .catch(() => {});
    }

    if (!config.mentionReply) return;

    for (const user of message.mentions.users.values()) {
      if (user.bot || user.id === message.author.id) continue;

      const afk = await services.db.prisma.afkEntry.findUnique({
        where: {
          guildId_userId: { guildId, userId: user.id },
        },
      });

      if (afk) {
        const target = message.guild?.members.cache.get(user.id);
        const displayName = stripPrefix(
          target?.displayName ?? user.username,
          config.nickPrefix,
        );
        const reason = sanitizeAfkReason(afk.reason, config.maxReasonLength);
        const duration = formatAfkDuration(
          Date.now() - new Date(afk.createdAt).getTime(),
        );
        await message
          .reply(buildAfkMentionCard(displayName, reason, duration))
          .catch(() => {});
        break;
      }
    }
  },
};

const afkModule: ModuleDefinition = defineModule({
  name: "utility-afk",
  displayName: "AFK",
  emoji: "💤",
  description: "Set AFK status with mention replies and nickname prefix",
  version: "2.0.0",
  config: AfkConfigSchema,
  configFields: [
    {
      key: "nickPrefixEnabled",
      label: "Nickname Prefix",
      type: "boolean",
      description: "Prefix nickname when AFK",
    },
    {
      key: "nickPrefix",
      label: "Prefix Text",
      type: "string",
      description: "Text to prepend to nickname",
    },
    {
      key: "mentionReply",
      label: "Mention Reply",
      type: "boolean",
      description: "Reply when mentioned while AFK",
    },
    {
      key: "maxReasonLength",
      label: "Max Reason Length",
      type: "number",
      description: "Maximum AFK reason length",
    },
  ],
  commands: [afkDef],
  listeners: [onMessageListener],
  tasks: [],
  async onLoad(_services) {
    console.log("[afk] Module loaded");
    return [];
  },
  async onUnload(_services) {
    console.log("[afk] Module unloaded");
  },
});

export default afkModule;
