import { Events, Listener } from "@sapphire/framework";
import { SubcommandPluginEvents } from "@sapphire/plugin-subcommands";
import type { ClientEvents, Message, RepliableInteraction } from "discord.js";
import {
  errorCard,
  handleDenied,
} from "#lib/utilities/command-response.js";
import type { CardReply } from "#lib/utilities/cards.js";

type DeniedEvent =
  | typeof Events.ChatInputCommandDenied
  | typeof Events.ContextMenuCommandDenied
  | typeof Events.MessageCommandDenied;

export function createDeniedListener<E extends DeniedEvent>(
  event: E,
  getTarget: (payload: ClientEvents[E][1]) => RepliableInteraction | Message,
): new (context: Listener.LoaderContext) => Listener<E> {
  return class extends Listener<E> {
    public constructor(context: Listener.LoaderContext) {
      super(context, { event });
    }

    public async run(error: ClientEvents[E][0], payload: ClientEvents[E][1]) {
      return handleDenied(getTarget(payload), error, payload);
    }
  };
}

type ErrorEvent =
  | typeof Events.ChatInputCommandError
  | typeof Events.ContextMenuCommandError
  | typeof Events.MessageCommandError
  | typeof SubcommandPluginEvents.ChatInputSubcommandError
  | typeof SubcommandPluginEvents.MessageSubcommandError;

interface NamedCommand {
  command: { name: string };
}

export function createErrorListener<
  E extends ErrorEvent,
  T extends RepliableInteraction | Message,
>(
  event: E,
  label: string,
  getTarget: (payload: ClientEvents[E][1]) => T,
  respond: (target: T, card: CardReply) => Promise<unknown>,
): new (context: Listener.LoaderContext) => Listener<E> {
  return class extends Listener<E> {
    public constructor(context: Listener.LoaderContext) {
      super(context, { event });
    }

    public async run(error: ClientEvents[E][0], payload: ClientEvents[E][1]) {
      const { name } = (payload as NamedCommand).command;
      const { card } = errorCard(`${label}:${name}`, error);
      try {
        await respond(getTarget(payload), card);
      } catch (err: unknown) {
        this.container.logger.error(
          `[${label}:${name}] Failed to send error card:`,
          err,
        );
      }
    }
  };
}
