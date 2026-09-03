import {
  InteractionHandler,
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
  /**
   * Ensures only the original invoker can use the interaction.
   * Throws UserError (caught by the framework's denied handler) if the user doesn't match.
   */
  protected checkSecurity(
    interaction: AnyInteraction,
    ownerId: string,
  ): void {
    if (interaction.user.id !== ownerId) {
      throw new UserError({
        identifier: "AccessDenied",
        message: `${Emojis.CROSS} Only the original invoker can use these components.`,
      });
    }
  }

  /** Safely acknowledges the interaction. */
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
