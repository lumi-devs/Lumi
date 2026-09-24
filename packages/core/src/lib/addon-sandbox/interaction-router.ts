import { InteractionHandler, InteractionHandlerTypes } from "@sapphire/framework";
import type { Interaction, MessageComponentInteraction, ModalSubmitInteraction } from "discord.js";
import type { AddonHost } from "./AddonHost.js";

export class AddonInteractionRouter extends InteractionHandler {
  public constructor(
    context: InteractionHandler.LoaderContext,
    private readonly host: AddonHost,
    name = "addon-interaction-router",
    type: InteractionHandlerTypes = InteractionHandlerTypes.MessageComponent,
  ) {
    super(context, { name, interactionHandlerType: type });
  }

  public override parse(interaction: Interaction) {
    if (!interaction.isMessageComponent() && !interaction.isModalSubmit()) return this.none();
    const owner = this.host.ownerOfCustomId(interaction.customId);
    return owner ? this.some({ owner }) : this.none();
  }

  public override async run(interaction: Interaction, result?: { owner: string }) {
    if (!result) return;
    await this.host.invokeInteraction(
      result.owner,
      interaction as MessageComponentInteraction | ModalSubmitInteraction,
    );
  }
}
