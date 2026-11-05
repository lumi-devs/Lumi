import { ephemeralCard, makeErrorCard } from "@lumi/ui";
import {
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";
import { renderHubPanel } from "../panel/hubViews.js";
import { renderModuleDetail } from "../panel/moduleSettings.js";
import type { BotServices } from "../../core/contracts.js";
import { permitCommand } from "./permit.js";

export const moduleCommands = [
  {
    requiresAdmin: true,
    data: new SlashCommandBuilder()
      .setName("lumi")
      .setDescription("Open the Lumi control panel"),
    async execute(
      interaction: ChatInputCommandInteraction,
      services: BotServices,
    ): Promise<void> {
      if (!interaction.guildId) {
        await interaction.reply(
          ephemeralCard(
            makeErrorCard("Lumi", "This command can only be used in a server."),
          ),
        );
        return;
      }
      await interaction.reply(
        ephemeralCard(await renderHubPanel("home", interaction, services)),
      );
    },
  },
  {
    requiresAdmin: true,
    data: new SlashCommandBuilder()
      .setName("config")
      .setDescription("Open a module's configuration")
      .addStringOption((option) =>
        option
          .setName("module")
          .setDescription("Module to configure")
          .setRequired(true)
          .setAutocomplete(true),
      ),
    async autocomplete(
      interaction: AutocompleteInteraction,
      services: BotServices,
    ): Promise<void> {
      const focused = interaction.options.getFocused(true);
      const query = String(focused.value ?? "").toLowerCase();
      const modules = services.moduleLoader
        .listAll()
        .filter((module) => module.isSubmodule)
        .filter((module) => {
          const manifest = module.manifest;
          return (
            manifest.name.toLowerCase().includes(query) ||
            manifest.displayName.toLowerCase().includes(query)
          );
        })
        .slice(0, 25)
        .map((module) => ({
          name: `${module.manifest.emoji} ${module.manifest.displayName}`,
          value: module.manifest.name,
        }));
      await interaction.respond(modules);
    },
    async execute(
      interaction: ChatInputCommandInteraction,
      services: BotServices,
    ): Promise<void> {
      if (!interaction.guildId) {
        await interaction.reply(
          ephemeralCard(
            makeErrorCard(
              "Config",
              "This command can only be used in a server.",
            ),
          ),
        );
        return;
      }
      const moduleName = interaction.options.getString("module", true);
      const loaded = services.moduleLoader.getModule(moduleName);
      if (!loaded?.isSubmodule) {
        await interaction.reply(
          ephemeralCard(
            makeErrorCard(
              "Unknown Module",
              `No configurable module named \`${moduleName}\` is loaded.`,
            ),
          ),
        );
        return;
      }
      await interaction.reply(
        ephemeralCard(
          await renderModuleDetail(interaction, services, moduleName, 0),
        ),
      );
    },
  },
  permitCommand,
];
