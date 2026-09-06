import {
  filterAutocompleteChoices,
  respondWithChoices,
} from "#lib/utilities/autocomplete.js";
import type { AutocompleteInteraction } from "discord.js";
import { ApplyOptions } from "@sapphire/decorators";
import type { ApplicationCommandRegistry } from "@sapphire/framework";
import {
  BaseSubcommand,
  fetchTyped,
  replyError,
  replySuccess,
  sendReply,
} from "#lib/commands.js";
import {
  ChannelType,
  channelMention,
  roleMention,
  type ChatInputCommandInteraction,
  type GuildTextBasedChannel,
} from "discord.js";
import { ephemeralCard } from "#lib/utilities/cards.js";
import { paginateList } from "#lib/utilities/pagination.js";
import { getUtility } from "#lib/module-system/Utility.js";
import type ReactionRolesUtility from "../utilities/ReactionRolesUtility.js";
import { isReactionRoleMode, maxOptionsForMode } from "../data.js";
import { buildMenuDetailCard, buildMenuListCard } from "../ui/panel.js";

@ApplyOptions<BaseSubcommand.Options>({
  name: "reactionroles",
  description: "Self-serve role menus for this server.",
  preconditions: ["GuildOnly", "ModuleEnabled"],
  module: "reactionroles",
  requiredPermit: "reactionroles.manage",
  subcommands: [
    {
      name: "menu",
      type: "group",
      entries: [
        { name: "create", chatInputRun: "chatInputMenuCreate" },
        { name: "delete", chatInputRun: "chatInputMenuDelete" },
        { name: "list", chatInputRun: "chatInputMenuList" },
        { name: "post", chatInputRun: "chatInputMenuPost" },
        { name: "panel", chatInputRun: "chatInputMenuPanel" },
      ],
    },
    {
      name: "option",
      type: "group",
      entries: [
        { name: "add", chatInputRun: "chatInputOptionAdd" },
        { name: "remove", chatInputRun: "chatInputOptionRemove" },
      ],
    },
  ],
})
export class ReactionRolesCommand extends BaseSubcommand {
  private get service(): ReactionRolesUtility {
    return getUtility("reactionroles");
  }

  public override async autocompleteRun(
    interaction: AutocompleteInteraction,
  ): Promise<void> {
    const focused = interaction.options.getFocused(true);
    if (focused.name !== "menu" && focused.name !== "option") {
      return respondWithChoices(interaction, []);
    }
    const guildId = interaction.guildId;
    if (!guildId) return respondWithChoices(interaction, []);
    const menus = await this.service.listMenus(guildId).catch(() => []);
    if (focused.name === "menu") {
      return respondWithChoices(
        interaction,
        filterAutocompleteChoices(
          menus.map((m) => m.id),
          focused.value,
        ),
      );
    }
    const menuId = interaction.options.getString("menu") ?? "";
    const menu = menus.find((m) => m.id === menuId);
    return respondWithChoices(
      interaction,
      filterAutocompleteChoices(
        (menu?.options ?? []).map((o) => o.id),
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
        .addSubcommandGroup((group) =>
          group
            .setName("menu")
            .setDescription("Create, post, and manage role menus.")
            .addSubcommand((sub) =>
              sub
                .setName("create")
                .setDescription("Create a new role menu.")
                .addStringOption((opt) =>
                  opt
                    .setName("title")
                    .setDescription("Menu title shown on the card.")
                    .setMaxLength(100)
                    .setRequired(true),
                )
                .addStringOption((opt) =>
                  opt
                    .setName("mode")
                    .setDescription("How members pick roles.")
                    .setRequired(false)
                    .addChoices(
                      { name: "Buttons", value: "buttons" },
                      { name: "Dropdown", value: "select" },
                      { name: "Reactions", value: "reactions" },
                    ),
                )
                .addStringOption((opt) =>
                  opt
                    .setName("description")
                    .setDescription("Short text shown under the title.")
                    .setMaxLength(1000)
                    .setRequired(false),
                )
                .addBooleanOption((opt) =>
                  opt
                    .setName("exclusive")
                    .setDescription("Members may hold only one role from this menu.")
                    .setRequired(false),
                ),
            )
            .addSubcommand((sub) =>
              sub
                .setName("delete")
                .setDescription("Delete a role menu.")
                .addStringOption((opt) =>
                  opt
                    .setName("menu")
                    .setDescription("The menu to delete.")
                    .setRequired(true)
                    .setAutocomplete(true),
                ),
            )
            .addSubcommand((sub) =>
              sub.setName("list").setDescription("List all role menus."),
            )
            .addSubcommand((sub) =>
              sub
                .setName("post")
                .setDescription("Post a menu card in a channel.")
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
            )
            .addSubcommand((sub) =>
              sub
                .setName("panel")
                .setDescription("Open the management panel for a menu.")
                .addStringOption((opt) =>
                  opt
                    .setName("menu")
                    .setDescription("The menu to manage (defaults to the menu list).")
                    .setRequired(false)
                    .setAutocomplete(true),
                ),
            ),
        )
        .addSubcommandGroup((group) =>
          group
            .setName("option")
            .setDescription("Manage the role options on a menu.")
            .addSubcommand((sub) =>
              sub
                .setName("add")
                .setDescription("Add a role option to a menu.")
                .addStringOption((opt) =>
                  opt
                    .setName("menu")
                    .setDescription("The menu to add to.")
                    .setRequired(true)
                    .setAutocomplete(true),
                )
                .addRoleOption((opt) =>
                  opt
                    .setName("role")
                    .setDescription("The role members get.")
                    .setRequired(true),
                )
                .addStringOption((opt) =>
                  opt
                    .setName("label")
                    .setDescription("Button/select label (defaults to the role name).")
                    .setMaxLength(80)
                    .setRequired(false),
                )
                .addStringOption((opt) =>
                  opt
                    .setName("emoji")
                    .setDescription("Emoji shown on the option.")
                    .setMaxLength(100)
                    .setRequired(false),
                )
                .addStringOption((opt) =>
                  opt
                    .setName("description")
                    .setDescription("Short explainer shown beside the option.")
                    .setMaxLength(100)
                    .setRequired(false),
                )
                .addRoleOption((opt) =>
                  opt
                    .setName("required_role")
                    .setDescription("Members must hold this role first.")
                    .setRequired(false),
                ),
            )
            .addSubcommand((sub) =>
              sub
                .setName("remove")
                .setDescription("Remove a role option from a menu.")
                .addStringOption((opt) =>
                  opt
                    .setName("menu")
                    .setDescription("The menu to edit.")
                    .setRequired(true)
                    .setAutocomplete(true),
                )
                .addStringOption((opt) =>
                  opt
                    .setName("option")
                    .setDescription("The option to remove.")
                    .setRequired(true)
                    .setAutocomplete(true),
                ),
            ),
        ),
    );
  }

  public async chatInputMenuCreate(
    interaction: ChatInputCommandInteraction,
  ): Promise<void> {
    const t = await fetchTyped(interaction);
    const guildId = interaction.guildId!;
    const title = interaction.options.getString("title", true);
    const mode = interaction.options.getString("mode") ?? "buttons";
    const description = interaction.options.getString("description");
    const exclusive = interaction.options.getBoolean("exclusive") ?? false;

    if (!isReactionRoleMode(mode)) {
      return replyError(
        interaction,
        t("reactionroles:invalidModeTitle"),
        t("reactionroles:invalidModeMessage"),
      );
    }
    try {
      const menu = await this.service.createMenu(guildId, {
        title,
        description,
        mode,
        exclusive,
      });
      return replySuccess(
        interaction,
        t("reactionroles:menuCreatedTitle"),
        t("reactionroles:menuCreatedMessage", {
          title: menu.title,
          id: menu.id,
          max: maxOptionsForMode(menu.mode),
        }),
      );
    } catch (err: unknown) {
      return replyError(
        interaction,
        t("reactionroles:menuCreateFailedTitle"),
        err instanceof Error ? err.message : t("reactionroles:genericFailure"),
      );
    }
  }

  public async chatInputMenuDelete(
    interaction: ChatInputCommandInteraction,
  ): Promise<void> {
    const t = await fetchTyped(interaction);
    const menuId = interaction.options.getString("menu", true);
    const removed = await this.service.deleteMenu(interaction.guildId!, menuId);
    if (!removed) {
      return replyError(
        interaction,
        t("reactionroles:menuMissingTitle"),
        t("reactionroles:menuMissingMessage", { id: menuId }),
      );
    }
    return replySuccess(
      interaction,
      t("reactionroles:menuDeletedTitle"),
      t("reactionroles:menuDeletedMessage", { id: menuId }),
    );
  }

  public async chatInputMenuList(
    interaction: ChatInputCommandInteraction,
  ): Promise<void> {
    const t = await fetchTyped(interaction);
    const menus = await this.service.listMenus(interaction.guildId!);
    const lines = menus.map(
      (m) =>
        `**${m.title}** (\`${m.id}\`) — ${m.mode} · ${m.options.length} option(s)${m.exclusive ? " · exclusive" : ""}`,
    );
    await paginateList({
      interactionOrMessage: interaction,
      userId: interaction.user.id,
      title: t("reactionroles:menuListTitle"),
      items: lines,
      perPage: 5,
      ephemeral: true,
    });
  }

  public async chatInputMenuPost(
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
      return replyError(
        interaction,
        t("reactionroles:menuPostFailedTitle"),
        err instanceof Error ? err.message : t("reactionroles:genericFailure"),
      );
    }
  }

  public async chatInputMenuPanel(
    interaction: ChatInputCommandInteraction,
  ): Promise<void> {
    const t = await fetchTyped(interaction);
    const guildId = interaction.guildId!;
    const menuId = interaction.options.getString("menu");
    if (menuId) {
      const menu = await this.service.getMenu(guildId, menuId);
      if (!menu) {
        return replyError(
          interaction,
          t("reactionroles:menuMissingTitle"),
          t("reactionroles:menuMissingMessage", { id: menuId }),
        );
      }
      await sendReply(
        interaction,
        ephemeralCard(buildMenuDetailCard(menu)),
      );
      return;
    }
    const menus = await this.service.listMenus(guildId);
    await sendReply(interaction, ephemeralCard(buildMenuListCard(menus)));
  }

  public async chatInputOptionAdd(
    interaction: ChatInputCommandInteraction,
  ): Promise<void> {
    const t = await fetchTyped(interaction);
    const guildId = interaction.guildId!;
    const menuId = interaction.options.getString("menu", true);
    const role = interaction.options.getRole("role", true);
    const label = interaction.options.getString("label") ?? role.name;
    const emoji = interaction.options.getString("emoji");
    const description = interaction.options.getString("description");
    const requiredRole = interaction.options.getRole("required_role");
    try {
      const menu = await this.service.addOption(guildId, menuId, {
        label,
        emoji,
        description,
        roleId: role.id,
        requiredRoleId: requiredRole?.id,
      });
      return replySuccess(
        interaction,
        t("reactionroles:optionAddedTitle"),
        t("reactionroles:optionAddedMessage", {
          label,
          role: roleMention(role.id),
          title: menu.title,
        }),
      );
    } catch (err: unknown) {
      return replyError(
        interaction,
        t("reactionroles:optionAddFailedTitle"),
        err instanceof Error ? err.message : t("reactionroles:genericFailure"),
      );
    }
  }

  public async chatInputOptionRemove(
    interaction: ChatInputCommandInteraction,
  ): Promise<void> {
    const t = await fetchTyped(interaction);
    const menuId = interaction.options.getString("menu", true);
    const optionId = interaction.options.getString("option", true);
    try {
      const menu = await this.service.removeOption(
        interaction.guildId!,
        menuId,
        optionId,
      );
      return replySuccess(
        interaction,
        t("reactionroles:optionRemovedTitle"),
        t("reactionroles:optionRemovedMessage", {
          id: optionId,
          title: menu.title,
        }),
      );
    } catch (err: unknown) {
      return replyError(
        interaction,
        t("reactionroles:optionRemoveFailedTitle"),
        err instanceof Error ? err.message : t("reactionroles:genericFailure"),
      );
    }
  }
}
