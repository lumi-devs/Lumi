import {
  InteractionHandler,
  type InteractionHandlerOptions,
  container,
} from "@sapphire/framework";
import type {
  ButtonInteraction,
  StringSelectMenuInteraction,
  UserSelectMenuInteraction,
  RoleSelectMenuInteraction,
  MentionableSelectMenuInteraction,
  ChannelSelectMenuInteraction,
} from "discord.js";
import { MessageFlags } from "discord.js";
import { makeErrorCard } from "#utilities/cards.js";
import { EmberEmojis } from "#utilities/assets.js";

export type AnyInteraction =
  | ButtonInteraction
  | StringSelectMenuInteraction
  | UserSelectMenuInteraction
  | RoleSelectMenuInteraction
  | MentionableSelectMenuInteraction
  | ChannelSelectMenuInteraction;

export abstract class EmberInteractionHandler extends InteractionHandler {
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
  protected async checkSecurity(
    interaction: AnyInteraction,
    ownerId: string,
  ): Promise<boolean> {
    if (interaction.user.id === ownerId) return true;

    await interaction.reply({
      ...makeErrorCard(
        "Access Denied",
        `${EmberEmojis.CROSS} Only the original invoker can use these components.`,
      ),
      flags: MessageFlags.Ephemeral,
    });
    return false;
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

  /**
   * Standard error handler for interactions.
   * @param interaction The interaction.
   * @param error The error that occurred.
   */
  protected async handleError(interaction: AnyInteraction, error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    container.logger.error(
      `[InteractionHandler] Error in ${this.name}:`,
      error,
    );

    const payload = {
      ...makeErrorCard(
        "Interaction Error",
        `An error occurred while processing your request: \`${message}\``,
      ),
      components: [],
    };

    if (interaction.replied || interaction.deferred) {
      await interaction.editReply(payload);
    } else {
      await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
    }
  }
}
