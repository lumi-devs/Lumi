import { Client } from "discord.js";
import { buildClientOptions } from "#src/lib/client/ClientOptions.js";
import { createServices, attachClient, useServices, container } from "#src/lib/Services.js";
import { loginLumi, destroyLumi } from "#src/lib/client/LumiClient.js";
import { envParseString, validateRequiredEnv, validateAddonSignatureConfig } from "#src/lib/Env.js";
import { ExitCodes } from "#src/lib/ExitCodes.js";
import { consumeRestartRequested } from "#src/lib/Restart.js";

export interface BootstrapAppOptions {
  onlineMessage?: string;
  extraDrainSteps?: Array<{ name: string; run: () => Promise<void> | void }>;
}

export async function bootstrapClientApp(
  options: BootstrapAppOptions = {},
): Promise<Client> {
  validateRequiredEnv(["BOT_TOKEN", "APPEAL_TOKEN_SECRET"]);
  validateAddonSignatureConfig();

  const client = new Client(buildClientOptions());
  const services = createServices(client);
  attachClient(client, services);
  useServices(services);

  let shuttingDown = false;
  ["SIGINT", "SIGTERM"].forEach((sig) => {
    process.once(sig, async () => {
      if (shuttingDown) process.exit(130);
      shuttingDown = true;
      try {
        await destroyLumi(client, container);
        process.exit(consumeRestartRequested() ? ExitCodes.RESTART : ExitCodes.SHUTDOWN);
      } catch {
        process.exit(1);
      }
    });
  });

  await loginLumi(client, container, envParseString("BOT_TOKEN"));
  container.logger.info(options.onlineMessage ?? "[Lumi] Online");
  return client;
}
