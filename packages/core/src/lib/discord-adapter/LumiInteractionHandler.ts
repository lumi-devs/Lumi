import {
  InteractionHandler,
  InteractionHandlerTypes,
  UserError,
} from "@sapphire/framework";
import {
  DiscordAPIError,
  RESTJSONErrorCodes,
  type ButtonInteraction,
  type StringSelectMenuInteraction,
  type UserSelectMenuInteraction,
  type RoleSelectMenuInteraction,
  type MentionableSelectMenuInteraction,
  type ChannelSelectMenuInteraction,
  type ModalSubmitInteraction,
  type AutocompleteInteraction,
} from "discord.js";
import { Emojis } from "#lib/utilities/assets.js";

export type AnyInteraction =
  | ButtonInteraction
  | StringSelectMenuInteraction
  | UserSelectMenuInteraction
  | RoleSelectMenuInteraction
  | MentionableSelectMenuInteraction
  | ChannelSelectMenuInteraction
  | ModalSubmitInteraction
  | AutocompleteInteraction;

export interface LumiInteractionHandlerOptions extends InteractionHandler.Options {
  module?: string;
}

/**
 * Base class for all Lumi interaction handlers.
 * Provides services access, security helpers, and safe interaction resolution.
 */
export abstract class LumiInteractionHandler<
  I extends AnyInteraction = AnyInteraction,
  T = unknown,
> extends InteractionHandler {
  public constructor(
    context: InteractionHandler.LoaderContext,
    options: LumiInteractionHandlerOptions,
  ) {
    super(context, options);
  }

  public get services() {
    return this.container;
  }

  protected checkSecurity(
    interaction: I,
    ownerId: string,
  ): void {
    if ("user" in interaction && interaction.user.id !== ownerId) {
      throw new UserError({
        identifier: "AccessDenied",
        message: `${Emojis.Cross} Only the original invoker can use these components.`,
      });
    }
  }

  protected async acknowledge(interaction: I): Promise<void> {
    const isComponent = "isMessageComponent" in interaction && interaction.isMessageComponent();
    const isModal = "isModalSubmit" in interaction && interaction.isModalSubmit();

    if (!isComponent && !isModal) return;
    if ("replied" in interaction && interaction.replied) return;
    if ("deferred" in interaction && interaction.deferred) return;

    try {
      if ("deferUpdate" in interaction) {
        await interaction.deferUpdate();
      }
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

export namespace LumiInteractionHandler {
  export type Options = LumiInteractionHandlerOptions;
}

export abstract class LumiButtonHandler<T = unknown> extends LumiInteractionHandler<
  ButtonInteraction,
  T
> {
  public constructor(
    context: InteractionHandler.LoaderContext,
    options: LumiInteractionHandler.Options,
  ) {
    super(context, {
      ...options,
      interactionHandlerType: InteractionHandlerTypes.Button,
    });
  }
}

export abstract class LumiStringSelectHandler<T = unknown> extends LumiInteractionHandler<
  StringSelectMenuInteraction,
  T
> {
  public constructor(
    context: InteractionHandler.LoaderContext,
    options: LumiInteractionHandler.Options,
  ) {
    super(context, {
      ...options,
      interactionHandlerType: InteractionHandlerTypes.SelectMenu,
    });
  }
}

export abstract class LumiModalHandler<T = unknown> extends LumiInteractionHandler<
  ModalSubmitInteraction,
  T
> {
  public constructor(
    context: InteractionHandler.LoaderContext,
    options: LumiInteractionHandler.Options,
  ) {
    super(context, {
      ...options,
      interactionHandlerType: InteractionHandlerTypes.ModalSubmit,
    });
  }
}

export abstract class LumiAutocompleteHandler<T = unknown> extends LumiInteractionHandler<
  AutocompleteInteraction,
  T
> {
  public constructor(
    context: InteractionHandler.LoaderContext,
    options: LumiInteractionHandler.Options,
  ) {
    super(context, {
      ...options,
      interactionHandlerType: InteractionHandlerTypes.Autocomplete,
    });
  }
}