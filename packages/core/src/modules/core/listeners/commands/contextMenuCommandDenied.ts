import { Events } from "@sapphire/framework";
import type { RepliableInteraction } from "discord.js";
import { createDeniedListener } from "#modules/core/lib/command-listener-factory.js";

export const ContextMenuCommandDeniedListener = createDeniedListener(
  Events.ContextMenuCommandDenied,
  (payload) => payload.interaction as RepliableInteraction,
);
