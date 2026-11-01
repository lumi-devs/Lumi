import type { CommandDefinition } from "@lumi/module-kit";
import { SlashCommandBuilder } from "discord.js";
import { executeQuote, type PrefixAwareInteraction } from "./service.js";

export const quoteCommand: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("quote")
    .setDescription("Turn a message or text into a quote image")
    .addStringOption((option) =>
      option
        .setName("message")
        .setDescription("Discord message link or ID to quote")
        .setRequired(false),
    )
    .addStringOption((option) =>
      option
        .setName("text")
        .setDescription("Text to quote when no message is given")
        .setRequired(false)
        .setMaxLength(4000),
    )
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("Who said the text. Defaults to you")
        .setRequired(false),
    ),
  aliases: ["q"],
  async execute(interaction, services) {
    await executeQuote({
      interaction: interaction as PrefixAwareInteraction,
      services,
    });
  },
};
