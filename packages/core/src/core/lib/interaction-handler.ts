import {
  InteractionHandler,
  InteractionHandlerOptions,
  UserError,
} from "@sapphire/framework";
import type {
  ButtonInteraction,
  StringSelectMenuInteraction,
  UserSelectMenuInteraction,
  RoleSelectMenuInteraction,
  MentionableSelectMenuInteraction,
  ChannelSelectMenuInteraction,
} from "discord.js";
import { Emojis } from "#utilities/assets.js";

export type AnyInteraction =
  | ButtonInteraction
  | StringSelectMenuInteraction
  | UserSelectMenuInteraction
  | RoleSelectMenuInteraction
  | MentionableSelectMenuInteraction
  | ChannelSelectMenuInteraction;

export abstract class BaseInteractionHandler extends InteractionHandler {
  public constructor(
    context: InteractionHandler.LoaderContext,
    options: InteractionHandlerOptions,
  ) {
    super(context, options);
  }

  /**
   * Standardized security check for interactions.
   * Ensures only the original invoker can use the interaction.
   * @param interaction The interaction to check.
   * @param ownerId The ID of the user who is allowed to interact.
   * @returns True if the user is allowed, false otherwise (replies with an error card).
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  protected async checkSecurity(
    interaction: AnyInteraction,
    ownerId: string,
  ): Promise<boolean> {
    if (interaction.user.id === ownerId) return true;

    throw new UserError({
      identifier: "AccessDenied",
      message: `${Emojis.CROSS} Only the original invoker can use these components.`,
    });
  }

  /**
   * Safely acknowledges the interaction.
   * @param interaction The interaction to acknowledge.
   */
  protected async acknowledge(interaction: AnyInteraction) {
    if (
      interaction.isMessageComponent() &&
      !interaction.replied &&
      !interaction.deferred
    ) {
      await interaction.deferUpdate();
    }
  }
}
