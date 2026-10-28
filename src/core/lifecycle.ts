import type { Client } from "discord.js";

interface BootOptions {
  token: string;
  client: Client;
}

export async function boot(options: BootOptions): Promise<void> {
  const { token, client } = options;

  client.once("clientReady", () => {
    console.log(`Logged in as ${client.user?.tag}`);
  });

  client.on("error", (error) => {
    console.error("Discord client error:", error);
  });

  await client.login(token);
}

export async function shutdown(client: Client): Promise<void> {
  console.log("Shutting down...");
  await client.destroy();
  console.log("Shutdown complete");
}
