import { Events } from "@sapphire/framework";
import { createDeniedListener } from "#modules/core/lib/command-listener-factory.js";

export const ChatInputCommandDeniedListener = createDeniedListener(
  Events.ChatInputCommandDenied,
  (payload) => payload.interaction,
);
