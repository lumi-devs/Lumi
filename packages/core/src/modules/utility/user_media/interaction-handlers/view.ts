import {
  InteractionHandlerTypes,
  InteractionHandler,
} from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import { ButtonInteraction, MessageFlags } from "discord.js";
import { BaseInteractionHandler } from "#lib/interaction-handler.js";
import { handleMediaRequest } from "../media-utils.js";

@ApplyOptions<InteractionHandler.Options>({
  interactionHandlerType: InteractionHandlerTypes.Button,
})
export default class UserMediaViewHandler extends BaseInteractionHandler {
  public override parse(interaction: ButtonInteraction) {
    if (!interaction.customId.startsWith("user-media:view:"))
      return this.none();
    const [, , userId, type] = interaction.customId.split(":");
    return this.some({ userId, type });
  }

  public async run(
    interaction: ButtonInteraction,
    { userId, type }: { userId: string; type: string },
  ) {
    await interaction.deferReply({
      flags: MessageFlags.Ephemeral | (MessageFlags.IsComponentsV2 as number),
    });
    await handleMediaRequest({
      context: interaction,
      targetUser: await interaction.client.users.fetch(userId),
      mediaType: type as "avatar" | "banner",
      container: this.container,
    });
  }
}
