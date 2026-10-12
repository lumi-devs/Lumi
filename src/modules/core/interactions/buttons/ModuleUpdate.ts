import { getUtility } from "#src/lib/module-system/Utility.js";
import type { Container } from "#src/lib/Services.js";
import { UserError } from "#src/shared/Index.ts";
import { PermitResolver } from "#src/lib/api/permissions/PermitResolver.js";
import { type ButtonInteraction } from "discord.js";
import {
  acknowledge,
  checkSecurity,
  defineInteraction,
} from "#src/lib/interactions/InteractionDef.js";
import { makeErrorCard, makeInfoCard } from "#src/lib/ui/Cards.js";
import { errorFrom } from "#src/lib/utilities/Errors.js";
import { moduleUpdateResultCard } from "#src/modules/core/ui/ModuleUpdateCard.js";
import type { DownloaderUtility } from "#src/modules/core/utilities/DownloaderUtility.js";
import { ModuleUpdateId } from "#src/modules/core/Constants.js";

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
