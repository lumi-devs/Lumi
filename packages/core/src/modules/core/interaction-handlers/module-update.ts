import { ApplyOptions } from "@sapphire/decorators";
import { getUtility } from "#lib/module-system/Utility.js";
import {
  InteractionHandler,
  InteractionHandlerTypes,
  UserError,
} from "@sapphire/framework";
import { PermitResolver } from "#lib/permissions/index.js";
import { type ButtonInteraction } from "discord.js";
import { BaseInteractionHandler } from "#lib/interaction-handler.js";
import { makeErrorCard, makeInfoCard } from "#lib/utilities/cards.js";
import { Emojis } from "#lib/utilities/assets.js";
import { errorFrom } from "#lib/utilities/errors.js";
import { moduleUpdateResultCard } from "#lib/downloader/cards.js";
import type { DownloaderUtility } from "#utilities/pieces/DownloaderUtility.js";

@ApplyOptions<InteractionHandler.Options>({
  interactionHandlerType: InteractionHandlerTypes.Button,
})
export class ModuleUpdateInteractionHandler extends BaseInteractionHandler {
  private get downloaderService(): DownloaderUtility {
    return getUtility("downloader");
  }

  public override parse(interaction: ButtonInteraction) {
    if (!interaction.customId.startsWith("module:update:")) return this.none();

    const [, , moduleName, userId] = interaction.customId.split(":");
    if (!moduleName || !userId) return this.none();

    return this.some({ moduleName, userId });
  }

  public override async run(
    interaction: ButtonInteraction,
    { moduleName, userId }: { moduleName: string; userId: string },
  ) {
    this.checkSecurity(interaction, userId);
    if (!PermitResolver.isBotOwner(interaction.user.id)) {
      throw new UserError({
        identifier: "AccessDenied",
        message: `${Emojis.CROSS} Only Bot Owners can update modules.`,
      });
    }

    await this.acknowledge(interaction);

    await interaction.editReply(
      makeInfoCard(
        "Updating Module",
        `${Emojis.LOADING} Checking and downloading updates for **${moduleName}**...`,
      ),
    );

    try {
      const result = await this.downloaderService.updateModule(moduleName);
      await interaction.editReply(
        moduleUpdateResultCard(result, moduleName, userId),
      );
    } catch (err: unknown) {
      await interaction.editReply(
        makeErrorCard(`${Emojis.ERROR} Update Failed`, errorFrom(err).message),
      );
    }
  }
}
