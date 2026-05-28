import { ApplyOptions } from "@sapphire/decorators";
import {
  InteractionHandler,
  InteractionHandlerTypes,
} from "@sapphire/framework";
import { type ButtonInteraction } from "discord.js";
import { EmberInteractionHandler } from "#core/lib/interaction-handler.js";
import {
  makeSuccessCard,
  makeErrorCard,
  makeInfoCard,
} from "#utilities/cards.js";
import { EmberEmojis } from "#utilities/assets.js";
import type { DownloaderService } from "#core/services/DownloaderService.js";

@ApplyOptions<InteractionHandler.Options>({
  interactionHandlerType: InteractionHandlerTypes.Button,
})
export class ModuleUpdateInteractionHandler extends EmberInteractionHandler {
  private get downloaderService(): DownloaderService {
    return this.container.stores
      .get("services")
      .get("downloader") as DownloaderService;
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
    if (!(await this.checkSecurity(interaction, userId))) return;

    await this.acknowledge(interaction);

    await interaction.editReply(
      makeInfoCard(
        "Updating Module",
        `${EmberEmojis.LOADING} Checking and downloading updates for **${moduleName}**...`,
      ),
    );

    try {
      const result = await this.downloaderService.updateModule(moduleName);

      if (result.updated) {
        const changelogStr = result.changelog
          ? `### Pull Changelog:\n\`\`\`git\n${result.changelog}\n\`\`\``
          : "No changelog details provided.";

        await interaction.editReply(
          makeSuccessCard(
            `${EmberEmojis.DOWNLOAD} Module Updated`,
            `Successfully updated and hot-reloaded **${moduleName}**!\n\n${changelogStr}`,
          ),
        );
      } else {
        await interaction.editReply(
          makeSuccessCard(
            `${EmberEmojis.CHECK} Module Up-To-Date`,
            `**${moduleName}** is already running the latest version!`,
          ),
        );
      }
    } catch (err: unknown) {
      const error = err as Error;
      await interaction.editReply(
        makeErrorCard(`${EmberEmojis.ERROR} Update Failed`, error.message),
      );
    }
  }
}
