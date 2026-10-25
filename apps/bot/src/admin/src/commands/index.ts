import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
} from "discord.js";
import { HubPanel, type HubServices } from "../panel/HubPanel.js";
import { ephemeralCard, makeErrorCard } from "@lumi/ui";

export const moduleCommands = [
  {
    data: new SlashCommandBuilder()
      .setName("lumi")
      .setDescription("Open the Lumi control panel")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    async execute(interaction: ChatInputCommandInteraction, services: HubServices) {
      if (!interaction.guildId) {
        await interaction.reply(
          ephemeralCard(
            makeErrorCard("Lumi", "This command can only be used in a server."),
          ),
        );
        return;
      }
      await interaction.reply(await HubPanel.render("home", interaction, services));
    },
  },
];
