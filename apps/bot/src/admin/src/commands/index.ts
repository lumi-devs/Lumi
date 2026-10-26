import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
} from "discord.js";
import { HubPanel, type HubServices } from "../panel/HubPanel.js";
import { ephemeralCard, makeErrorCard } from "@lumi/ui";
import { permitCommand } from "./permit.js";

export const moduleCommands = [
  {
    requiresAdmin: true,
    data: new SlashCommandBuilder()
      .setName("lumi")
      .setDescription("Open the Lumi control panel"),
    async execute(interaction: ChatInputCommandInteraction, services: HubServices) {
      if (!interaction.guildId) {
        await interaction.reply(
          ephemeralCard(
            makeErrorCard("Lumi", "This command can only be used in a server."),
          ),
        );
        return;
      }
      await interaction.reply(ephemeralCard(await HubPanel.render("home", interaction, services)));
    },
  },
  permitCommand,
];
