import type { Client } from "discord.js";
import { logger } from "./logger.js";

interface BootOptions {
  token: string;
  client: Client;
}

export async function boot(options: BootOptions): Promise<void> {
  const { token, client } = options;

  client.once("clientReady", () => {
    logger.info("Discord client ready", { user: client.user?.tag });
  });

  client.on("error", (error) => {
    logger.error("Discord client error", { error });
  });

  await client.login(token);
}

export async function shutdown(client: Client): Promise<void> {
  logger.info("Destroying Discord client");
  await client.destroy();
}
