import { ApplyOptions } from "@sapphire/decorators";
import {
  InteractionHandler,
  InteractionHandlerTypes,
} from "@sapphire/framework";
import { type ButtonInteraction } from "discord.js";
import { BaseInteractionHandler } from "#core/lib/interaction-handler.js";
import { buildHelpCard } from "../commands/help.js";

@ApplyOptions<InteractionHandler.Options>({
  interactionHandlerType: InteractionHandlerTypes.Button,
})
export class HelpInteractionHandler extends BaseInteractionHandler {
  public override parse(interaction: ButtonInteraction) {
    if (!interaction.customId.startsWith("help:page:")) return this.none();

    const [, , userId, pageIndexStr] = interaction.customId.split(":");
    if (!userId || !pageIndexStr) return this.none();

    return this.some({ userId, pageIndex: parseInt(pageIndexStr, 10) });
  }

  public override async run(
    interaction: ButtonInteraction,
    result: { userId: string; pageIndex: number },
  ) {
    if (!(await this.checkSecurity(interaction, result.userId))) return;

    await this.acknowledge(interaction);

    let prefix = ",";
    if (interaction.guildId) {
      const settings = await this.container.db.config.getGuildSettings(
        interaction.guildId,
      );
      prefix = settings.prefix ?? ",";
    }

    const card = buildHelpCard(
      this.container,
      result.pageIndex,
      result.userId,
      prefix,
    );
    return interaction.editReply(card);
  }
}
