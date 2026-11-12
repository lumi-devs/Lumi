import { requireGuildId as guildIdOf } from "@lumi/foundation";
import {
  type CommandDefinition,
  defineModule,
  type ListenerDefinition,
  type ModuleDefinition,
  type ModuleServices,
} from "@lumi/module-kit";
import { ephemeralCard, makeErrorCard } from "@lumi/ui";
import {
  type APIInteractionGuildMember,
  type GuildMember,
  type Message,
  SlashCommandBuilder,
} from "discord.js";
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
});

type AfkConfig = z.infer<typeof AfkConfigSchema>;

const AfkConfigKey = "afk";

const getAfkConfig = async (
  services: ModuleServices,
  guildId: string,
): Promise<AfkConfig> => {
  let stored: unknown = null;
  try {
    stored = await services.moduleConfig.read(
      guildId,
      services.moduleName ?? AfkConfigKey,
      AfkConfigKey,
    );
  } catch (error) {
    services.observability?.logger?.warn?.("afk config read failed", {
      guildId,
      error,
    });
    stored = null;
  }
  const parsed = AfkConfigSchema.safeParse(stored ?? {});
  if (parsed.success) return parsed.data;

  services.observability?.logger?.warn?.(
    "[afk] invalid configuration, using defaults",
    { guildId, issues: parsed.error.issues },
  );
  return AfkConfigSchema.parse({});
};

const RemovalCooldownMs = 2000;

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
    const guildId = guildIdOf(interaction.guildId);
    if (!guildId) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard("Server Only", "AFK status is tracked per server."),
        ),
      );
      return;
    }
    const config = await getAfkConfig(services, guildId);
    const rawReason = interaction.options.getString("reason") ?? "AFK";
    const reason = sanitizeAfkReason(rawReason, config.maxReasonLength);

    await services.helpers.utility.afk.setRemovalCooldown(
      guildId,
      interaction.user.id,
      RemovalCooldownMs,
    );

    const existing = await services.helpers.utility.afk.findEntry(
      guildId,
      interaction.user.id,
    );

    const status = existing
      ? existing.reason === reason
        ? "already"
        : "updated"
      : "set";

    if (status !== "already") {
      await services.helpers.utility.afk.upsertEntry(
        guildId,
        interaction.user.id,
        reason,
      );
    }

    const member = interaction.member;
    if (
      status === "set" &&
      isGuildMember(member) &&
      config.nickPrefixEnabled &&
      !member.displayName.startsWith(config.nickPrefix)
    ) {
      await member
        .setNickname(
          `${config.nickPrefix}${member.displayName}`.slice(0, 32),
          "AFK",
        )
        .catch((error: unknown) =>
          services.observability?.logger?.warn?.(
            "failed to prefix AFK nickname",
            {
              guildId,
              userId: interaction.user.id,
              error,
            },
          ),
        );
    }

    await interaction.reply(ephemeralCard(buildAfkStatusCard(status, reason)));
  },
};

const onMessageListener: ListenerDefinition = {
  event: "messageCreate",
  async handler(message: Message, services: ModuleServices) {
    if (!message.inGuild() || message.author.bot) return;

    const guildId = message.guildId;
    const config = await getAfkConfig(services, guildId);

    const mentioned = [...message.mentions.users.values()].filter(
      (user) => !user.bot && user.id !== message.author.id,
    );
    const userIds = [message.author.id, ...mentioned.map((user) => user.id)];
    const entries = await services.helpers.utility.afk.listEntries(
      guildId,
      userIds,
    );
    const byUser = new Map<string, { reason: string; createdAt: Date }>(
      entries.map(
        (entry: { userId: string; reason: string; createdAt: Date }) => [
          entry.userId,
          entry,
        ],
      ),
    );
    const authorAfk = byUser.get(message.author.id);

    if (
      authorAfk &&
      !(await services.helpers.utility.afk.isRemovalCooldown(
        guildId,
        message.author.id,
      ))
    ) {
      try {
        await services.helpers.utility.afk.deleteEntry(
          guildId,
          message.author.id,
        );
      } catch (error) {
        services.observability?.logger?.warn?.("failed to clear AFK entry", {
          guildId,
          userId: message.author.id,
          error,
        });
      }

      const member = message.member;
      if (
        isGuildMember(member) &&
        config.nickPrefixEnabled &&
        member.displayName.startsWith(config.nickPrefix)
      ) {
        await member
          .setNickname(
            stripPrefix(member.displayName, config.nickPrefix) || null,
            "No longer AFK",
          )
          .catch((error: unknown) =>
            services.observability?.logger?.warn?.(
              "failed to strip AFK nickname",
              {
                guildId,
                userId: message.author.id,
                error,
              },
            ),
          );
      }

      const duration = formatAfkDuration(
        Date.now() - new Date(authorAfk.createdAt).getTime(),
      );
      await message.reply(buildAfkRemovalCard(duration)).catch(() => {});
    }

    if (!config.mentionReply) return;

    for (const user of mentioned) {
      const afk = byUser.get(user.id);
      if (!afk) continue;

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
  },
};

const afkModule: ModuleDefinition = defineModule({
  name: "afk",
  displayName: "AFK",
  emoji: "💤",
  description: "Set AFK status with mention replies and nickname prefix",
  version: "2.0.0",
  config: AfkConfigSchema,
  dataLifecycle: {
    async exportUserData(services, guildId, userId) {
      return services.helpers.utility.afk.findEntry(guildId, userId);
    },
    async deleteUserData(services, guildId, userId) {
      const result = await services.helpers.utility.afk.deleteByUser(
        guildId,
        userId,
      );
      return { deleted: result.count };
    },
  },
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
