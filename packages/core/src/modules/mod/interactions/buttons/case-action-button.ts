import { ApplyOptions } from "@sapphire/decorators";
import { InteractionHandlerTypes } from "@sapphire/framework";
import type { ButtonInteraction } from "discord.js";
import {
  LumiButtonHandler,
  LumiInteractionHandler,
} from "#lib/discord-adapter/LumiInteractionHandler.js";
import { defineCustomId } from "#lib/interactions/custom-id.js";
import { isModuleEnabled } from "#lib/utilities/misc.js";

export const CaseActionButtonId = defineCustomId("mod:case-action", [
  "action",
  "caseId",
]);

@ApplyOptions<LumiInteractionHandler.Options>({
  name: "mod-case-action-button",
  interactionHandlerType: InteractionHandlerTypes.Button,
  module: "mod",
})
export class CaseActionButtonHandler extends LumiButtonHandler<{
  action: string;
  caseId: string;
}> {
  public override parse(interaction: ButtonInteraction) {
    const parsed = CaseActionButtonId.parse(interaction.customId);
    if (!parsed) return this.none();
    return this.some(parsed);
  }

  public override async run(
    interaction: ButtonInteraction,
    { action, caseId }: { action: string; caseId: string },
  ): Promise<void> {
    const { db } = this.services;
    const guildId = interaction.guildId ?? interaction.guild?.id ?? null;
    if (!guildId) return;
    if (!(await isModuleEnabled(guildId, "mod"))) return;

    await interaction.deferReply({ ephemeral: true });

    const caseNumber = Number.parseInt(caseId, 10);
    if (Number.isNaN(caseNumber)) {
      await interaction.editReply("Invalid case number.");
      return;
    }

    const modCase = await db.moderation.getModerationCase(
      guildId,
      caseNumber,
    );

    if (!modCase) {
      await interaction.editReply(`Case #${caseNumber} not found.`);
      return;
    }

    if (action === "view") {
      await interaction.editReply(
        `Case #${modCase.caseNumber}: **${modCase.action}** applied to <@${modCase.userId}>. Reason: ${modCase.reason ?? "No reason provided."}`,
      );
      return;
    }

    await interaction.editReply(`Action ${action} is not yet implemented for Case #${caseNumber}.`);
  }
}
