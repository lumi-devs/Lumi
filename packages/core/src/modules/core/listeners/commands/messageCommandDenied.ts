import { Events } from "@sapphire/framework";
import { createDeniedListener } from "#modules/core/services/command-listener-factory.js";

export const MessageCommandDeniedListener = createDeniedListener(
  Events.MessageCommandDenied,
  (payload) => payload.message,
);
