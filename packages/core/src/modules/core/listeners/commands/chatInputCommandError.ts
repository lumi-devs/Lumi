import { Events } from "@sapphire/framework";
import { respond } from "#lib/utilities/command-response.js";
import { createErrorListener } from "#modules/core/lib/command-listener-factory.js";

export const ChatInputCommandErrorListener = createErrorListener(
  Events.ChatInputCommandError,
  "Command",
  (payload) => payload.interaction,
  respond,
);
