import { getUtility } from "@lumi/lib/module-system/utility.js";
import type { Container } from "@lumi/lib/services.js";
import { UserError } from "@lumi/shared";
import { PermitResolver } from "@lumi/lib/permissions/permit-resolver.js";
import { type ButtonInteraction } from "discord.js";
import {
  acknowledge,
  checkSecurity,
  defineInteraction,
} from "@lumi/lib/interactions/interaction-def.js";
import { makeErrorCard, makeInfoCard } from "@lumi/lib/ui/cards.js";
import { errorFrom } from "@lumi/lib/utilities/errors.js";
import { moduleUpdateResultCard } from "../../ui/module-update-card.js";
import type { DownloaderUtility } from "../../utilities/DownloaderUtility.js";
import { ModuleUpdateId } from "../../constants.js";

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
