import type { Container } from "@lib/Services.js";
import type { ButtonInteraction } from "discord.js";
import {
  acknowledge,
  defineInteraction,
} from "@interactions/InteractionDef.js";
import { fetchTyped } from "@i18n/Index.js";
import { revertPanic } from "@modules/security/services/Panic.js";
import { ephemeralCard, makeErrorCard } from "@ui/Cards.js";
import { memberRoleIds } from "@api/permissions/Subject.js";
import { PanicRevertId, buildPanicRevertedCard } from "@modules/security/ui/PanicCard.js";

export const panicRevert = defineInteraction({
  prefix: PanicRevertId,
  module: "security",
  async run(services: Container, interaction: ButtonInteraction) {
    if (interaction.customId !== PanicRevertId) return;
    const { guild } = interaction;
    if (!guild) return;
    await acknowledge(interaction);
    const t = await fetchTyped(interaction);

    const hasPermit = await services.permitResolver.hasPermit({
      guildId: guild.id,
      userId: interaction.user.id,
      roleIds: memberRoleIds(interaction.member),
      channelId: interaction.channelId,
      permitNode: "admin.*",
      guildOwnerId: guild.ownerId,
    });
    if (!hasPermit) {
      await interaction.followUp(
        ephemeralCard(
          makeErrorCard(t("panels:panicDeniedTitle"), t("panels:panicDenied")),
        ),
      );
      return;
    }

    const result = await revertPanic(guild.id);
    if (!result) {
      await interaction.editReply(
        makeErrorCard(t("panels:panicNotActiveTitle"), t("panels:panicNotActive")),
      );
      return;
    }

    await interaction.editReply(buildPanicRevertedCard(t, result.restoredCount));
  },
});
