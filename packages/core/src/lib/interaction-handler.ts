import {
  InteractionHandler,
  UserError,
} from "@sapphire/framework";
import { DiscordAPIError, RESTJSONErrorCodes } from "discord.js";
import type {
  ButtonInteraction,
  StringSelectMenuInteraction,
  UserSelectMenuInteraction,
  RoleSelectMenuInteraction,
  MentionableSelectMenuInteraction,
  ChannelSelectMenuInteraction,
  ModalSubmitInteraction,
} from "discord.js";
import { Emojis } from "#lib/utilities/assets.js";

export type AnyInteraction =
  | ButtonInteraction
  | StringSelectMenuInteraction
  | UserSelectMenuInteraction
  | RoleSelectMenuInteraction
  | MentionableSelectMenuInteraction
  | ChannelSelectMenuInteraction
  | ModalSubmitInteraction;

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
        message: `${Emojis.Cross} Only the original invoker can use these components.`,
      });
    }
  }

  /** `replied`/`deferred` are per-instance, so a duplicated dispatch races past
   * them and Discord answers 40060. Losing that race still leaves the
   * interaction acknowledged, which is all this promises. */
  protected async acknowledge(interaction: AnyInteraction) {
    const acknowledgeable =
      interaction.isMessageComponent() || interaction.isModalSubmit();
    if (!acknowledgeable || interaction.replied || interaction.deferred) return;

    try {
      await interaction.deferUpdate();
    } catch (err: unknown) {
      if (
        err instanceof DiscordAPIError &&
        err.code === RESTJSONErrorCodes.InteractionHasAlreadyBeenAcknowledged
      ) {
        return;
      }
      throw err;
    }
  }
}
