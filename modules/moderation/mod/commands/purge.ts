import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { CommandDefinition } from "@lumi/module-kit";
import { ephemeralCard, makeInfoCard, makeSuccessCard } from "@lumi/ui";
import { replyError } from "../helpers.js";

export const purgeDef: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("purge")
    .setDescription("Delete messages")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption(o => o.setName("amount").setDescription("Number of messages (1-100)").setMinValue(1).setMaxValue(100).setRequired(true))
    .addUserOption(o => o.setName("user").setDescription("Only delete from this user").setRequired(false))
    .addStringOption(o => o.setName("contains").setDescription("Only delete messages containing this text").setRequired(false))
    .addBooleanOption(o => o.setName("links").setDescription("Only delete messages with links").setRequired(false))
    .addBooleanOption(o => o.setName("bots").setDescription("Only delete bot messages").setRequired(false)),
  requiredPermit: "utility.purge",
  async execute(interaction) {
    const amount = interaction.options.getInteger("amount", true);
    const channel = interaction.channel!;

    if (!channel.isTextBased() || channel.isDMBased()) {
      await replyError(interaction, "Invalid channel", "Can only purge in text channels");
      return;
    }

    const user = interaction.options.getUser("user");
    const contains = interaction.options.getString("contains");
    const links = interaction.options.getBoolean("links");
    const bots = interaction.options.getBoolean("bots");

    const messages = await channel.messages.fetch({ limit: amount });
    let toDelete = messages.filter(m => !m.pinned);

    if (user) toDelete = toDelete.filter(m => m.author.id === user.id);
    if (contains) toDelete = toDelete.filter(m => m.content.includes(contains));
    if (links) toDelete = toDelete.filter(m => m.content.match(/https?:\/\//));
    if (bots) toDelete = toDelete.filter(m => m.author.bot);

    if (toDelete.size === 0) {
      await interaction.reply(ephemeralCard(makeInfoCard(
        "Nothing to delete",
        "No messages matched those filters.",
      )));
      return;
    }

    const deleted = await channel.bulkDelete(toDelete, true);

    await interaction.reply(ephemeralCard(makeSuccessCard("Purged", [
      `**Deleted**\n${deleted.size} message${deleted.size === 1 ? "" : "s"}`,
      `**Channel**\n${channel}`,
    ])));
  },
};

