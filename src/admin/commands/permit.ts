import {
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";
import type { HubServices } from "../panel/services.js";
import { autocompleteNode } from "./permit/autocomplete.js";
import { createPermit } from "./permit/create.js";
import { explainPermit } from "./permit/explain.js";

export const permitCommand = {
  requiresAdmin: true,
  data: new SlashCommandBuilder()
    .setName("permit")
    .setDescription("Create permits and explain permission checks")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("create")
        .setDescription("Create a permit")
        .addStringOption((option) =>
          option
            .setName("nodes")
            .setDescription(
              "Permission nodes, comma-separated: mod.ban, admin.config",
            )
            .setRequired(true)
            .setMaxLength(1000)
            .setAutocomplete(true),
        )
        .addStringOption((option) =>
          option
            .setName("polarity")
            .setDescription("Grant or Deny")
            .setRequired(true)
            .addChoices(
              { name: "Grant", value: "Grant" },
              { name: "Deny", value: "Deny" },
            ),
        )
        .addIntegerOption((option) =>
          option
            .setName("position")
            .setDescription("Priority, lower numbers run first")
            .setMinValue(0)
            .setMaxValue(1000),
        )
        .addStringOption((option) =>
          option
            .setName("name")
            .setDescription("Optional display name")
            .setMaxLength(64),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("explain")
        .setDescription("Explain a member's permission check")
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("Member to check")
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName("node")
            .setDescription("Permission node to evaluate, or omit to check all")
            .setAutocomplete(true),
        )
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Optional channel context"),
        ),
    ),
  async execute(
    interaction: ChatInputCommandInteraction,
    services: HubServices,
  ): Promise<void> {
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === "create") {
      await createPermit(interaction, services);
      return;
    }
    await explainPermit(interaction, services);
  },
  async autocomplete(
    interaction: AutocompleteInteraction,
    services: HubServices,
  ): Promise<void> {
    await autocompleteNode(interaction, services);
  },
};
