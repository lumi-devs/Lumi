import { Events } from "@sapphire/framework";
import { respondMessage } from "#lib/utilities/command-response.js";
import { createErrorListener } from "#modules/core/lib/command-listener-factory.js";

export const MessageCommandErrorListener = createErrorListener(
  Events.MessageCommandError,
  "MessageCommand",
  (payload) => payload.message,
  respondMessage,
);
