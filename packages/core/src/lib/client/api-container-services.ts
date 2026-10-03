import { buildRestOptions } from "#lib/discord-rest.js";
import { getScheduledTasksConnectionOptions } from "#lib/client/scheduled-tasks-queue.js";
import { envParseString, getBotToken } from "#lib/env.js";
import { PinoSapphireLogger } from "#lib/logging/PinoSapphireLogger.js";
import type { OwnedEventBus } from "#lib/event-bus/factory.js";
import { SapphireClient } from "@sapphire/framework";
import { Routes, type APIUser } from "discord-api-types/v10";
import { installContainerServices } from "./container-services.js";

export interface ApiContainerServices {
  client: SapphireClient;
  ownedEventBus: OwnedEventBus;
}

/**
 * Installs container services for the gateway-free RPC server process.
 * Configures REST authentication and loads stores without invoking `client.login()`.
 */
export async function installApiContainerServices(): Promise<ApiContainerServices> {
  const client = new SapphireClient({
    intents: [],
    rest: buildRestOptions(),
    baseUserDirectory: null,
    loadDefaultErrorListeners: false,
    loadApplicationCommandRegistriesStatusListeners: false,
    loadMessageCommandListeners: false,
    logger: {
      instance: new PinoSapphireLogger(envParseString("SERVICE_NAME", "lumi-api")),
    },
    // Satisfies ClientOptions type augmentation from @sapphire/plugin-scheduled-tasks.
    tasks: {
      bull: {
        connection: getScheduledTasksConnectionOptions(),
      },
    },
  });

  const ownedEventBus = installContainerServices(client);

  client.rest.setToken(getBotToken());
  const me = (await client.rest.get(Routes.user())) as APIUser;
  // Minimal ClientUser stand-in for RPC handlers reading user ID without gateway READY.
  client.user = { id: me.id } as NonNullable<typeof client.user>;

  await Promise.all([...client.stores.values()].map((store) => store.loadAll()));

  return { client, ownedEventBus };
}
