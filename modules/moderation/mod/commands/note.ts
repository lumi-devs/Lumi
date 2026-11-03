import type { CommandDefinition } from "@lumi/module-kit";
import { ephemeralCard, makeSuccessCard } from "@lumi/ui";
import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { getCaseLink } from "../helpers.js";

export const noteDef: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName("note")
    .setDescription("Add a note to a user")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((o) =>
      o.setName("user").setDescription("User to note").setRequired(true),
    )
    .addStringOption((o) =>
      o
        .setName("note")
        .setDescription("Note content")
        .setRequired(true)
        .setMaxLength(1000),
    )
    .addStringOption((o) =>
      o
        .setName("message_id")
        .setDescription("Message ID to link to this note")
        .setRequired(false),
    ),
  requiredPermit: "mod.note",
  async execute(interaction, services) {
    const target = interaction.options.getUser("user", true);
    const note = interaction.options.getString("note", true);
    const guild = interaction.guild!;

    await services.helpers.moderation.create({
      guildId: guild.id,
      kind: "note",
      targetId: target.id,
      moderatorId: interaction.user.id,
      reason: note,
      ...getCaseLink(interaction),
      metadata: { type: "note" },
    });

    await interaction.reply(
      ephemeralCard(
        makeSuccessCard("Note Added", [
          `**User**\n${target.tag} (\`${target.id}\`)`,
          `**Note**\n${note}`,
        ]),
      ),
    );
  },
};
