import { getUtility } from "#lib/module-system/Utility.js";
import type { Container } from "#lib/services.js";
import { UserError } from "@lumi/shared";
import { PermitResolver } from "#lib/permissions/PermitResolver.js";
import { type ButtonInteraction } from "discord.js";
import {
  acknowledge,
  checkSecurity,
  defineInteraction,
} from "#lib/interactions/interaction-def.js";
import { makeErrorCard, makeInfoCard } from "#lib/ui/cards.js";
import { Emojis } from "#lib/utilities/assets.js";
import { errorFrom } from "#lib/utilities/errors.js";
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
        message: `${Emojis.Cross} Only Bot Owners can update modules.`,
      });
    }

    await acknowledge(interaction);

    await interaction.editReply(
      makeInfoCard(
        "Updating Module",
        `${Emojis.Loading} Checking and downloading updates for **${moduleName}**...`,
      ),
    );

    try {
      const result = await downloaderService.updateModule(services, moduleName);
      await interaction.editReply(
        moduleUpdateResultCard(result, moduleName, userId),
      );
    } catch (err: unknown) {
      await interaction.editReply(
        makeErrorCard(`${Emojis.Error} Update Failed`, errorFrom(err).message),
      );
    }
  },
});
