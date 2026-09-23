import {
  InteractionHandlerTypes,
} from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import { ButtonInteraction, MessageFlags } from "discord.js";
import { ModuleInteractionHandler } from "#lib/interactions/ModuleInteractionHandler.js";
import { handleMediaRequest } from "../services/media-utils.js";
import { UserMediaViewId } from "../constants.js";

@ApplyOptions<ModuleInteractionHandler.Options>({
  interactionHandlerType: InteractionHandlerTypes.Button,
  module: "utility",
})
export default class UserMediaViewHandler extends ModuleInteractionHandler<
  ButtonInteraction,
  { userId: string; type: string }
> {
  public override parse(interaction: ButtonInteraction) {
    const parsed = UserMediaViewId.parse(interaction.customId);
    if (!parsed) return this.none();
    return this.some(parsed);
  }

  protected override async handle(
    interaction: ButtonInteraction,
    { userId, type }: { userId: string; type: string },
  ) {
    await interaction.deferReply({
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
    });
    await handleMediaRequest({
      context: interaction,
      targetUser: await interaction.client.users.fetch(userId),
      mediaType: type as "avatar" | "banner",
      container: this.container,
    });
  }
}
