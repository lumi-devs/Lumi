import { sendInteractionReply } from "#src/lib/utilities/CommandResponse.js";
import { createStringSelectMenu } from "#src/lib/ui/Panels.js";
import {
  ActionRowBuilder,
  ContextMenuCommandBuilder,
  type MessageActionRowComponentBuilder,
} from "@discordjs/builders";
import {
  ApplicationCommandType,
  MessageFlags,
  type MessageContextMenuCommandInteraction,
} from "discord.js";
import type { CommandDef } from "#src/lib/commands/CommandDef.js";
import type { Container } from "#src/lib/Services.js";
import { PunishAuthorSelectId } from "#src/modules/mod/Constants.js";

function punishAuthorMenu(): ContextMenuCommandBuilder {
  return new ContextMenuCommandBuilder()
    .setName("Punish Author")
    .setType(ApplicationCommandType.Message);
}

async function run(
  _services: Container,
  interaction: MessageContextMenuCommandInteraction,
): Promise<void> {
  if (!interaction.inGuild()) return;
  const authorId = interaction.targetMessage.author.id;

  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    createStringSelectMenu({
      customId: PunishAuthorSelectId.build({ authorId }),
      placeholder: "Choose a punishment...",
      options: [
        { label: "⚠️ Warn", value: "warn" },
        { label: "🔇 Timeout", value: "timeout" },
        { label: "👢 Kick", value: "kick" },
        { label: "🔨 Ban", value: "ban" },
        { label: "☣️ Quarantine", value: "quarantine" },
      ],
    }),
  );

  await sendInteractionReply(interaction, {
    content: `Choose a punishment for <@${authorId}>:`,
    components: [row],
    flags: MessageFlags.Ephemeral,
  }, "followUp");
}

export const punishAuthorDef: CommandDef = {
  name: "punish-author",
  module: "mod",
  description: "Punish the author of a message",
  guildOnly: true,
  requiredPermit: "mod.*",
  menuName: "Punish Author",
  contextMenu: {
    build: () => punishAuthorMenu(),
    run,
  },
};
