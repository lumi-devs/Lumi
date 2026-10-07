import type { ButtonInteraction } from "discord.js";
import { defineInteraction } from "#lib/interactions/interaction-def.js";
import { defineCustomId } from "#lib/interactions/custom-id.js";
import type { Container } from "#lib/services.js";
import { isModuleEnabled } from "#lib/utilities/misc.js";

export const CaseActionButtonId = defineCustomId("mod:case-action", [
  "action",
  "caseId",
]);

export const caseActionButton = defineInteraction({
  prefix: CaseActionButtonId.prefix,
  module: "mod",
  async run(services: Container, interaction: ButtonInteraction): Promise<void> {
    const parsed = CaseActionButtonId.parse(interaction.customId);
    if (!parsed) return;
    const { action, caseId } = parsed;
    const { db } = services;
    const guildId = interaction.guildId ?? interaction.guild?.id ?? null;
    if (!guildId) return;
    if (!(await isModuleEnabled(services, guildId, "mod"))) return;

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
  },
});
