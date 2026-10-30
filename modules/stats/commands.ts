import type {
  CommandDefinition,
  ListenerDefinition,
  ModuleServices,
} from "@lumi/module-kit";
import { ephemeralCard, makeErrorCard } from "@lumi/ui";
import {
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Guild,
  type GuildMember,
  type Interaction,
  SlashCommandBuilder,
  type SlashCommandSubcommandBuilder,
} from "discord.js";
import { getStatsConfig, type StatsConfig } from "./config.js";
import {
  DefaultLookback,
  LookbackValues,
  StatsModuleName,
  StatsPermitNode,
} from "./constants.js";
import {
  defaultState,
  editStats,
  parseStatsId,
  replyStats,
  type StatsState,
  TopTypes,
} from "./render.js";
import { parseLookback } from "./ranges.js";

function addLookbackOption(
  subcommand: SlashCommandSubcommandBuilder,
): SlashCommandSubcommandBuilder {
  return subcommand.addStringOption((option) =>
    option
      .setName("lookback")
      .setDescription("Time range to report")
      .addChoices(...LookbackValues.map((value) => ({ name: value, value })))
      .setRequired(false),
  );
}

export const statsCommand: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("stats")
    .setDescription("View server statistics")
    .setDMPermission(false)
    .addSubcommand((sub) =>
      addLookbackOption(
        sub.setName("server").setDescription("Server overview"),
      ),
    )
    .addSubcommand((sub) =>
      addLookbackOption(sub.setName("members").setDescription("Member growth")),
    )
    .addSubcommand((sub) =>
      addLookbackOption(
        sub.setName("channels").setDescription("Channel activity"),
      ),
    )
    .addSubcommand((sub) =>
      addLookbackOption(
        sub.setName("status").setDescription("Member statuses"),
      ),
    )
    .addSubcommand((sub) =>
      addLookbackOption(
        sub.setName("messages").setDescription("Message activity"),
      ),
    )
    .addSubcommand((sub) =>
      addLookbackOption(sub.setName("voice").setDescription("Voice activity")),
    )
    .addSubcommand((sub) =>
      addLookbackOption(
        sub
          .setName("user")
          .setDescription("Statistics for a member")
          .addUserOption((option) =>
            option
              .setName("target")
              .setDescription("Member to inspect")
              .setRequired(false),
          ),
      ),
    )
    .addSubcommand((sub) =>
      addLookbackOption(
        sub
          .setName("top")
          .setDescription("Leaderboards")
          .addStringOption((option) =>
            option
              .setName("type")
              .setDescription("Leaderboard to show")
              .addChoices(
                { name: "Message users", value: "message-users" },
                { name: "Voice users", value: "voice-users" },
                { name: "Message channels", value: "message-channels" },
                { name: "Voice channels", value: "voice-channels" },
              )
              .setRequired(false),
          )
          .addIntegerOption((option) =>
            option
              .setName("page")
              .setDescription("Page number")
              .setMinValue(1)
              .setRequired(false),
          ),
      ),
    ),
  async execute(interaction, services) {
    const guild = interaction.guild;
    if (!guild || !interaction.guildId) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard("Server Only", "Stats can only be used in a server."),
        ),
      );
      return;
    }
    if (!services.modules.isEnabled(guild.id, StatsModuleName)) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Stats Disabled",
            "Enable the Stats module with `/lumi` first.",
          ),
        ),
      );
      return;
    }

    const config = await getStatsConfig(services, guild.id);
    if (!(await canViewStats(interaction, services, guild, config))) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Permit Required",
            `This server restricts stats to the **${StatsPermitNode}** permit.`,
          ),
        ),
      );
      return;
    }

    const sub = interaction.options.getSubcommand(true) as StatsState["sub"];
    const lookback = parseLookback(
      interaction.options.getString("lookback") ?? DefaultLookback,
    );
    let target = "";
    let page = 1;

    if (sub === "user") {
      const user = interaction.options.getUser("target") ?? interaction.user;
      target = user.id;
    } else if (sub === "top") {
      const requested = interaction.options.getString("type");
      target = TopTypes.includes(requested as (typeof TopTypes)[number])
        ? (requested as string)
        : TopTypes[0]!;
      page = interaction.options.getInteger("page") ?? 1;
    }

    const state = defaultState(sub, interaction.user.id, {
      lookback,
      target,
      page,
    });
    await replyStats(interaction, services, guild, state);
  },
};

function memberRoleIds(
  member: GuildMember | { roles?: unknown } | null,
): string[] {
  if (!member) return [];
  const roles = (member as GuildMember).roles;
  if (Array.isArray(roles)) {
    return roles.filter(
      (roleId): roleId is string => typeof roleId === "string",
    );
  }
  const cache = (roles as { cache?: Map<string, unknown> } | undefined)?.cache;
  return cache ? [...cache.keys()] : [];
}

async function canViewStats(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
  services: ModuleServices,
  guild: Guild,
  config: StatsConfig,
): Promise<boolean> {
  if (config.public) return true;
  try {
    const result = await services.permits.explainPermit(
      {
        guildId: guild.id,
        userId: interaction.user.id,
        roleIds: memberRoleIds(interaction.member),
        channelId: interaction.channelId,
        guildOwnerId: guild.ownerId,
        permitNode: StatsPermitNode,
      },
      services.client,
    );
    return result?.allowed === true;
  } catch (error) {
    const logger = (
      services as {
        observability?: {
          logger?: { warn?: (message: string, meta?: unknown) => void };
        };
      }
    ).observability?.logger;
    logger?.warn?.("[stats] permit check failed", { error });
    return false;
  }
}

async function handleStatsButton(
  interaction: ButtonInteraction,
  services: ModuleServices,
): Promise<void> {
  const parsed = parseStatsId(interaction.customId);
  if (!parsed) return;
  if (!interaction.guildId || !interaction.guild) return;

  if (interaction.user.id !== parsed.state.ownerId) {
    await interaction.reply(
      ephemeralCard(
        makeErrorCard(
          "Not Your Panel",
          "Run `/stats` to open your own statistics card.",
        ),
      ),
    );
    return;
  }
  if (!services.modules.isEnabled(interaction.guild.id, StatsModuleName)) {
    await interaction.reply(
      ephemeralCard(
        makeErrorCard("Stats Disabled", "The Stats module is disabled."),
      ),
    );
    return;
  }

  const config = await getStatsConfig(services, interaction.guild.id);
  if (!(await canViewStats(interaction, services, interaction.guild, config))) {
    await interaction.reply(
      ephemeralCard(
        makeErrorCard(
          "Permit Required",
          `This server restricts stats to the **${StatsPermitNode}** permit.`,
        ),
      ),
    );
    return;
  }

  await interaction.deferUpdate();
  try {
    await editStats(interaction, services, interaction.guild, parsed.state);
  } catch (error) {
    const logger = (
      services as {
        observability?: {
          logger?: { warn?: (message: string, meta?: unknown) => void };
        };
      }
    ).observability?.logger;
    logger?.warn?.("[stats] button render failed", { error });
    await interaction
      .editReply(
        makeErrorCard(
          "Stats Unavailable",
          "Stats could not be rendered. Try refreshing in a moment.",
        ),
      )
      .catch(() => undefined);
  }
}

const statsInteractionListener: ListenerDefinition = {
  event: "interactionCreate",
  async handler(interaction: Interaction, services: ModuleServices) {
    if (!interaction.isButton()) return;
    if (!interaction.customId.startsWith("stats:")) return;
    await handleStatsButton(interaction, services);
  },
};

export const statsListeners = [statsInteractionListener];
