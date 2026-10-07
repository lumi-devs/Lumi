import type { CommandContext } from "#lib/command-context.js";
import type { Container } from "#lib/services.js";
import { SlashCommandBuilder } from "discord.js";
import type { CommandDef } from "#lib/commands/command-def.js";
import {
  filterAutocompleteChoices,
  respondWithChoices,
} from "#lib/utilities/autocomplete.js";
import type { AutocompleteInteraction } from "discord.js";
import { fetchTyped, replyError, replySuccess } from "#lib/commands.js";
import {
  ChannelType,
  channelMention,
  type ChatInputCommandInteraction,
  type GuildTextBasedChannel,
} from "discord.js";
import { getUtility } from "#lib/module-system/Utility.js";
import type { ReactionRolesUtility } from "../utilities/ReactionRolesUtility.js";
import { ReactionRoleMenuLockedError } from "../utilities/ReactionRolesUtility.js";

function service(): ReactionRolesUtility {
  return getUtility("reactionroles");
}

export const reactionrolesDef: CommandDef = {
  name: "reactionroles",
  module: "reactionroles",
  description: "Post a role menu card in a channel.",
  guildOnly: true,
  requiredPermit: "reactionroles.manage",
  build: () => {
    const builder = new SlashCommandBuilder().setName("reactionroles");
    return (
    builder
            .setName("reactionroles")
            .setDescription("Post a role menu card in a channel.")
            .addStringOption((opt) =>
              opt
                .setName("menu")
                .setDescription("The menu to post.")
                .setRequired(true)
                .setAutocomplete(true),
            )
            .addChannelOption((opt) =>
              opt
                .setName("channel")
                .setDescription("Where to post (defaults to this channel).")
                .addChannelTypes(
                  ChannelType.GuildText,
                  ChannelType.GuildAnnouncement,
                )
                .setRequired(false),
            )
    ) as SlashCommandBuilder;
  },
  run: async (ctx: CommandContext) => { const interaction: ChatInputCommandInteraction = ctx.interaction;
    const t = await fetchTyped(interaction);
    const guild = interaction.guild!;
    const menuId = interaction.options.getString("menu", true);
    const channel =
      (interaction.options.getChannel("channel") as GuildTextBasedChannel | null) ??
      (interaction.channel as GuildTextBasedChannel | null);
    if (!channel || !channel.isTextBased() || channel.isDMBased()) {
      return replyError(
        interaction,
        t("reactionroles:postChannelTitle"),
        t("reactionroles:postChannelMessage"),
      );
    }
    try {
      const { message } = await service().postMenu(ctx.services, guild, channel, menuId);
      return replySuccess(
        interaction,
        t("reactionroles:menuPostedTitle"),
        t("reactionroles:menuPostedMessage", {
          channel: channelMention(channel.id),
          jump: message.url,
        }),
      );
    } catch (err: unknown) {
      if (err instanceof ReactionRoleMenuLockedError) {
        return replyError(interaction, t("reactionroles:menuLockedTitle"), err.message);
      }
      return replyError(
        interaction,
        t("reactionroles:menuPostFailedTitle"),
        err instanceof Error ? err.message : t("reactionroles:genericFailure"),
      );
    }
  },
  autocomplete: async (services: Container, interaction: AutocompleteInteraction,) => {
    const focused = interaction.options.getFocused(true);
    if (focused.name !== "menu") {
      return respondWithChoices(interaction, []);
    }
    const guildId = interaction.guildId;
    if (!guildId) return respondWithChoices(interaction, []);
    const menus = await service().listMenus(services, guildId).catch(() => []);
    return respondWithChoices(
      interaction,
      filterAutocompleteChoices(
        menus.map((m) => m.id),
        focused.value,
      )
    );
  },
};
