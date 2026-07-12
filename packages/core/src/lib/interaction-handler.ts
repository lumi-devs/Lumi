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
import { Emojis } from "#lib/utilities/assets.js";

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
   * Ensures only the original invoker can use the interaction.
   * Throws UserError (caught by the framework's denied handler) if the user doesn't match.
   */
  protected checkSecurity(
    interaction: AnyInteraction,
    ownerId: string,
  ): boolean {
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
