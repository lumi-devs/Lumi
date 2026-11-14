import { getUtility } from "@module-system/Utility.js";
import type { Container } from "@lib/Services.js";
import { UserError } from "@shared/Index.ts";
import { PermitResolver } from "@api/permissions/PermitResolver.js";
import { type ButtonInteraction } from "discord.js";
import {
  acknowledge,
  checkSecurity,
  defineInteraction,
} from "@interactions/InteractionDef.js";
import { makeErrorCard, makeInfoCard } from "@ui/Cards.js";
import { errorFrom } from "@utilities/Errors.js";
import { moduleUpdateResultCard } from "@modules/admin/ui/ModuleUpdateCard.js";
import type { DownloaderUtility } from "@utilities/DownloaderUtility.js";
import { ModuleUpdateId } from "@interactions/ModuleIds.js";

export const moduleUpdate = defineInteraction({
  prefix: ModuleUpdateId.prefix,
  async run(services: Container, interaction: ButtonInteraction) {
    const parsed = ModuleUpdateId.parse(interaction.customId);
    if (!parsed) return;
    const { moduleName, userId } = parsed;
    const downloaderService: DownloaderUtility = getUtility("downloader");
    checkSecurity(interaction, userId);
    if (!PermitResolver.isBotOwner(interaction.user.id)) {
      throw new UserError({
        identifier: "AccessDenied",
        message: `❌ Only Bot Owners can update modules.`,
      });
    }

    await acknowledge(interaction);

    await interaction.editReply(
      makeInfoCard(
        "Updating Module",
        `⏳ Checking and downloading updates for **${moduleName}**...`,
      ),
    );

    try {
      const result = await downloaderService.updateModule(services, moduleName);
      await interaction.editReply(
        moduleUpdateResultCard(result, moduleName, userId),
      );
    } catch (err: unknown) {
      await interaction.editReply(
        makeErrorCard(`🔴 Update Failed`, errorFrom(err).message),
      );
    }
  },
});
