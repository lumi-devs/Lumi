import { Listener, Events } from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import { DiscordAPIError, HTTPError } from "discord.js";

@ApplyOptions<Listener.Options>({ event: Events.Error })
export class ClientErrorListener extends Listener<typeof Events.Error> {
  public run(error: Error) {
    const { logger } = this.container;
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
  }
}
