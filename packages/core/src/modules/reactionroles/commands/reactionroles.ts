import {
  filterAutocompleteChoices,
  respondWithChoices,
} from "#lib/utilities/autocomplete.js";
import type { AutocompleteInteraction } from "discord.js";
import { ApplyOptions } from "@sapphire/decorators";
import type { ApplicationCommandRegistry } from "@sapphire/framework";
import { BaseCommand, fetchTyped, replyError, replySuccess } from "#lib/commands.js";
import {
  ChannelType,
  channelMention,
  type ChatInputCommandInteraction,
  type GuildTextBasedChannel,
} from "discord.js";
import { getUtility } from "#lib/module-system/Utility.js";
import type ReactionRolesUtility from "../utilities/ReactionRolesUtility.js";
import { ReactionRoleMenuLockedError } from "../utilities/ReactionRolesUtility.js";

@ApplyOptions<BaseCommand.Options>({
  name: "reactionroles",
  description: "Post a role menu card in a channel.",
  preconditions: ["GuildOnly", "ModuleEnabled"],
  module: "reactionroles",
  requiredPermit: "reactionroles.manage",
})
export class ReactionRolesCommand extends BaseCommand {
  private get service(): ReactionRolesUtility {
    return getUtility("reactionroles");
  }

  public override async autocompleteRun(
    interaction: AutocompleteInteraction,
  ): Promise<void> {
    const focused = interaction.options.getFocused(true);
    if (focused.name !== "menu") {
      return respondWithChoices(interaction, []);
    }
    const guildId = interaction.guildId;
    if (!guildId) return respondWithChoices(interaction, []);
    const menus = await this.service.listMenus(guildId).catch(() => []);
    return respondWithChoices(
      interaction,
      filterAutocompleteChoices(
        menus.map((m) => m.id),
        focused.value,
      ),
    );
  }

  public override registerApplicationCommands(
    registry: ApplicationCommandRegistry,
  ) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName(this.name)
        .setDescription(this.description)
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
        ),
    );
  }

  public override async chatInputRun(
    interaction: ChatInputCommandInteraction,
  ): Promise<void> {
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
      const { message } = await this.service.postMenu(guild, channel, menuId);
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
  }
}
