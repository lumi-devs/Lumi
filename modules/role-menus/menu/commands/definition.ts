import type { CommandDefinition } from "@lumi/module-kit";
import { ephemeralCard, makeErrorCard } from "@lumi/ui";
import {
  ChannelType,
  SlashCommandBuilder,
} from "discord.js";
import { getRoleMenusConfig, MaxTempDurationSeconds } from "../config.js";
import { createGroup, deleteGroup, editGroup } from "./groups.js";
import { addOption, removeOption } from "./options.js";
import { listGroups, postGroup, refreshGroup } from "./posting.js";
import {
  canManage,
  disabledCard,
  missingGuildCard,
  ModuleName,
  PermitNode,
  resolveGroupOrReply,
} from "./shared.js";

export const rolemenuCommand: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("role-menu")
    .setDescription("Create and publish self-service role menus")
    .addSubcommand((sub) =>
      sub
        .setName("create")
        .setDescription("Create a role menu group")
        .addStringOption((option) =>
          option
            .setName("name")
            .setDescription("Unique group name")
            .setRequired(true)
            .setMaxLength(100),
        )
        .addStringOption((option) =>
          option
            .setName("description")
            .setDescription("Shown above the role options")
            .setMaxLength(500),
        )
        .addStringOption((option) =>
          option
            .setName("mode")
            .setDescription("How many roles a member may hold")
            .addChoices(
              { name: "Single", value: "single" },
              { name: "Multiple", value: "multiple" },
            ),
        )
        .addBooleanOption((option) =>
          option
            .setName("require_one")
            .setDescription("Members must keep at least one role"),
        )
        .addBooleanOption((option) =>
          option
            .setName("auto_toggle")
            .setDescription("Selecting a held role removes it"),
        )
        .addIntegerOption((option) =>
          option
            .setName("max_selections")
            .setDescription("Maximum roles a member may hold; 0 is unlimited")
            .setMinValue(0)
            .setMaxValue(25),
        )
        .addIntegerOption((option) =>
          option
            .setName("temp_seconds")
            .setDescription(
              "Temporary role duration in seconds; 0 is permanent (max 30 days)",
            )
            .setMinValue(0)
            .setMaxValue(MaxTempDurationSeconds),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("edit")
        .setDescription("Edit a role menu group's settings")
        .addStringOption((option) =>
          option
            .setName("group")
            .setDescription("Role menu group")
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addStringOption((option) =>
          option
            .setName("new_name")
            .setDescription("New group name")
            .setMaxLength(100),
        )
        .addStringOption((option) =>
          option
            .setName("description")
            .setDescription("New description; leave empty to clear")
            .setMaxLength(500),
        )
        .addStringOption((option) =>
          option
            .setName("mode")
            .setDescription("How many roles a member may hold")
            .addChoices(
              { name: "Single", value: "single" },
              { name: "Multiple", value: "multiple" },
            ),
        )
        .addBooleanOption((option) =>
          option
            .setName("require_one")
            .setDescription("Members must keep at least one role"),
        )
        .addBooleanOption((option) =>
          option
            .setName("auto_toggle")
            .setDescription("Selecting a held role removes it"),
        )
        .addIntegerOption((option) =>
          option
            .setName("max_selections")
            .setDescription("Maximum roles; 0 is unlimited")
            .setMinValue(0)
            .setMaxValue(25),
        )
        .addIntegerOption((option) =>
          option
            .setName("temp_seconds")
            .setDescription("Temporary duration in seconds; 0 is permanent")
            .setMinValue(0)
            .setMaxValue(MaxTempDurationSeconds),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("delete")
        .setDescription("Delete a role menu group and its posted menus")
        .addStringOption((option) =>
          option
            .setName("group")
            .setDescription("Role menu group")
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("add-option")
        .setDescription("Add a role to a group")
        .addStringOption((option) =>
          option
            .setName("group")
            .setDescription("Role menu group")
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addRoleOption((option) =>
          option
            .setName("role")
            .setDescription("Role members can claim")
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName("label")
            .setDescription("Button label")
            .setMaxLength(80),
        )
        .addStringOption((option) =>
          option
            .setName("emoji")
            .setDescription("Emoji shown on the option")
            .setMaxLength(100),
        )
        .addStringOption((option) =>
          option
            .setName("description")
            .setDescription("Short option description")
            .setMaxLength(100),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove-option")
        .setDescription("Remove a role from a group")
        .addStringOption((option) =>
          option
            .setName("group")
            .setDescription("Role menu group")
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addRoleOption((option) =>
          option
            .setName("role")
            .setDescription("Role to remove")
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("post")
        .setDescription("Publish a role menu")
        .addStringOption((option) =>
          option
            .setName("group")
            .setDescription("Role menu group")
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addStringOption((option) =>
          option
            .setName("style")
            .setDescription("How members claim roles")
            .addChoices(
              { name: "Buttons", value: "buttons" },
              { name: "Select menu", value: "select" },
              { name: "Reactions", value: "reactions" },
            ),
        )
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Channel to post in")
            .addChannelTypes(
              ChannelType.GuildText,
              ChannelType.GuildAnnouncement,
            ),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName("list").setDescription("List role menu groups"),
    )
    .addSubcommand((sub) =>
      sub
        .setName("refresh")
        .setDescription("Refresh a group's posted menus")
        .addStringOption((option) =>
          option
            .setName("group")
            .setDescription("Role menu group")
            .setRequired(true)
            .setAutocomplete(true),
        ),
    ),
  aliases: ["rolemenu"],
  prefixOnly: true,
  requiredPermit: PermitNode,

  async autocomplete(interaction, services) {
    if (!interaction.guildId) {
      await interaction.respond([]);
      return;
    }
    const focused = interaction.options.getFocused(true);
    if (focused.name !== "group") {
      await interaction.respond([]);
      return;
    }
    const authorized = await canManage(interaction, services);
    if (!authorized) {
      await interaction.respond([]);
      return;
    }
    const rows = await services.helpers.roleMenus
      .searchGroupNames(interaction.guildId, focused.value)
      .catch(() => []);
    await interaction.respond(
      rows.map((row: { name: string }) => ({
        name: row.name,
        value: row.name,
      })),
    );
  },

  async execute(interaction, services) {
    const guildId = interaction.guildId;
    if (!guildId || !interaction.guild) {
      await interaction.reply(ephemeralCard(missingGuildCard()));
      return;
    }
    if (!services.modules.isEnabled(guildId, ModuleName)) {
      await interaction.reply(ephemeralCard(disabledCard()));
      return;
    }
    if (!(await canManage(interaction, services))) {
      await interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Missing Permissions",
            "You need **Manage Server** or the **rolemenu.manage** permit.",
          ),
        ),
      );
      return;
    }

    const subcommand = interaction.options.getSubcommand();
    const config = await getRoleMenusConfig(services, guildId);

    if (subcommand === "create") {
      await createGroup(interaction, services, config);
      return;
    }
    if (subcommand === "list") {
      await listGroups(interaction, services);
      return;
    }

    const reference = interaction.options.getString("group", true);
    const group = await resolveGroupOrReply(interaction, services, reference);
    if (!group) return;

    switch (subcommand) {
      case "edit":
        await editGroup(interaction, services, group);
        return;
      case "delete":
        await deleteGroup(interaction, services, group);
        return;
      case "add-option":
        await addOption(interaction, services, group, config);
        return;
      case "remove-option":
        await removeOption(interaction, services, group);
        return;
      case "post":
        await postGroup(interaction, services, group, config);
        return;
      case "refresh":
        await refreshGroup(interaction, services, group);
        return;
      default:
        return;
    }
  },
};
