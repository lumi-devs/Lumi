import { BaseCommand, sendReply } from "#lib/commands.js";
import { createStringSelectMenu } from "#lib/ui/panels.js";
import { ApplyOptions } from "@sapphire/decorators";
import type { ApplicationCommandRegistry } from "@sapphire/framework";
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
import { PunishAuthorSelectId } from "../constants.js";

@ApplyOptions<BaseCommand.Options>({
  name: "punish-author",
  preconditions: ["GuildOnly"],
  requiredPermit: "mod.*",
})
export class PunishAuthorCommand extends BaseCommand {
  public override registerApplicationCommands(
    registry: ApplicationCommandRegistry,
  ) {
    registry.registerContextMenuCommand(
      new ContextMenuCommandBuilder()
        .setName("Punish Author")
        .setType(ApplicationCommandType.Message),
    );
  }

  public override async contextMenuRun(
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

    await sendReply(interaction, {
      content: `Choose a punishment for <@${authorId}>:`,
      components: [row],
      flags: MessageFlags.Ephemeral,
    });
  }
}
