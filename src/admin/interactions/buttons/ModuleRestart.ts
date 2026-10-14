import { UserError } from "#src/shared/Index.ts";
import type { Container } from "#src/lib/Services.js";
import { PermitResolver } from "#src/lib/api/permissions/PermitResolver.js";
import { type ButtonInteraction } from "discord.js";
import {
  acknowledge,
  checkSecurity,
  defineInteraction,
} from "#src/lib/interactions/InteractionDef.js";
import { makeSuccessCard, makeInfoCard } from "#src/lib/ui/Cards.js";
import { scheduleProcessRestart } from "#src/lib/Restart.js";
import { fetchTyped } from "#src/lib/i18n/Index.js";
import { ModuleRestartCancelId, ModuleRestartId } from "#src/lib/interactions/Ids.js";

export const moduleRestart = defineInteraction({
  prefix: [ModuleRestartCancelId.prefix, ModuleRestartId.prefix],
  async run(services: Container, interaction: ButtonInteraction) {
    const cancel = ModuleRestartCancelId.parse(interaction.customId);
    const restart = cancel ? null : ModuleRestartId.parse(interaction.customId);
    if (!cancel && !restart) return;
    const userId = (cancel ?? restart)!.userId;
    const action = cancel ? "cancel" : "restart";
    checkSecurity(interaction, userId);
    if (!PermitResolver.isBotOwner(interaction.user.id)) {
      throw new UserError({
        identifier: "AccessDenied",
        message: `❌ Only Bot Owners can restart Lumi.`,
      });
    }
    await acknowledge(interaction);
    const t = await fetchTyped(interaction, services);

    if (action === "cancel") {
      await interaction.editReply(
        makeInfoCard(
          `❌ ${t("core:restartCancelledTitle")}`,
          t("core:restartCancelledText"),
        ),
      );
      return;
    }

    await interaction.editReply(
      makeSuccessCard(
        `⏳ ${t("core:restartingTitle")}`,
        t("core:restartingText"),
      ),
    );
    scheduleProcessRestart(services, `bot owner ${userId} via update button`);
  },
});
