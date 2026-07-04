import { ApplyOptions } from "@sapphire/decorators";
import { getService } from "#core/module-system/Service.js";
import {
  InteractionHandler,
  InteractionHandlerTypes,
} from "@sapphire/framework";
import { type ButtonInteraction } from "discord.js";
import { BaseInteractionHandler } from "#core/lib/interaction-handler.js";
import { makeErrorCard, makeInfoCard } from "#utilities/cards.js";
import { Emojis } from "#utilities/assets.js";
import { errorFrom } from "#utilities/errors.js";
import { moduleUpdateResultCard } from "#core/lib/downloader/cards.js";
import type { DownloaderService } from "#core/services/DownloaderService.js";

@ApplyOptions<InteractionHandler.Options>({
  interactionHandlerType: InteractionHandlerTypes.Button,
})
export class ModuleUpdateInteractionHandler extends BaseInteractionHandler {
  private get downloaderService(): DownloaderService {
    return getService("downloader");
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
    if (!this.checkSecurity(interaction, userId)) return;

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
