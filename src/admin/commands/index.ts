import { ephemeralCard, makeErrorCard } from "@lumi/ui";
import {
  type ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";
import { renderHubPanel } from "../panel/hubViews.js";
import type { HubServices } from "../panel/services.js";
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
      await interaction.reply(ephemeralCard(await renderHubPanel("home", interaction, services)));
    },
  },
  permitCommand,
];
