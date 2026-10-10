import type { Container } from "@lumi/lib/services.js";
import type { ButtonInteraction } from "discord.js";
import {
  acknowledge,
  defineInteraction,
} from "@lumi/lib/interactions/interaction-def.js";
import { fetchTyped } from "@lumi/lib/i18n/index.js";
import { revertPanic } from "@lumi/application/services/security/panic.js";
import { ephemeralCard, makeErrorCard } from "@lumi/lib/ui/cards.js";
import { memberRoleIds } from "@lumi/lib/permissions/subject.js";
import { PanicRevertId, buildPanicRevertedCard } from "../../ui/panic-card.js";

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
