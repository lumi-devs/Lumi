import { SubcommandPluginEvents } from "@sapphire/plugin-subcommands";
import { respondMessage } from "#lib/utilities/command-response.js";
import { createErrorListener } from "#modules/core/lib/command-listener-factory.js";

export const MessageSubcommandErrorListener = createErrorListener(
  SubcommandPluginEvents.MessageSubcommandError,
  "MessageSubcommand",
  (payload) => payload.message,
  respondMessage,
);
