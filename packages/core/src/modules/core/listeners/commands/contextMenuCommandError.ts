import { Events } from "@sapphire/framework";
import type { RepliableInteraction } from "discord.js";
import { respond } from "#lib/utilities/command-response.js";
import { createErrorListener } from "#modules/core/lib/command-listener-factory.js";

export const ContextMenuCommandErrorListener = createErrorListener(
  Events.ContextMenuCommandError,
  "ContextMenu",
  (payload) => payload.interaction as RepliableInteraction,
  respond,
);
