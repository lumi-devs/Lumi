import { Events } from "discord.js";
import { defineListener } from "#lib/listeners/listener-def.js";
import type { Container } from "#lib/services.js";
import { DiscordAPIError, HTTPError } from "discord.js";

export const clientErrorListener = defineListener({
  name: "clientErrorListener",
  event: Events.Error,
  execute(services: Container, error: Error) {
    const { logger } = services;
    if (error instanceof DiscordAPIError) {
      logger.warn(
        `[Discord API] code ${error.code} - ${error.method} ${error.url}: ${error.message}`,
      );
      logger.error(error.stack);
    } else if (error instanceof HTTPError) {
      logger.warn(
        `[Discord HTTP] status ${error.status} - ${error.method} ${error.url}: ${error.message}`,
      );
      logger.error(error.stack);
    } else {
      logger.error("[Client]", error);
    }
  },
});
