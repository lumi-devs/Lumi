import { SubcommandPluginEvents } from "@sapphire/plugin-subcommands";
import { respond } from "#lib/utilities/command-response.js";
import { createErrorListener } from "#modules/core/lib/command-listener-factory.js";

export const ChatInputSubcommandErrorListener = createErrorListener(
  SubcommandPluginEvents.ChatInputSubcommandError,
  "Subcommand",
  (payload) => payload.interaction,
  respond,
);
