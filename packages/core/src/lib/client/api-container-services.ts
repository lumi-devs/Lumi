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

  try {
    const rawApp = (await client.rest.get(Routes.oauth2CurrentApplication())) as {
      id: string;
      owner?: { id: string };
      team?: { id: string; members: Array<{ user: { id: string } }> };
    };
    client.application = Object.assign(
      Object.create(client.application ?? {}),
      {
        id: rawApp.id,
        owner: rawApp.team
          ? {
              id: rawApp.team.id,
              members: new Set(rawApp.team.members.map((m) => m.user.id)),
            }
          : rawApp.owner
            ? { id: rawApp.owner.id }
            : null,
      },
    );
  } catch (err: unknown) {
    client.logger.warn("[Api] Failed to fetch application info for bot owner check:", err);
  }

  // Discover and load modules first so their piece directories are registered into client.stores.
  await client.stores.get("modules")?.loadAll();

  // api process only needs utilities, preconditions, and arguments — never gateway commands/listeners.
  const apiStores = new Set(["utilities", "preconditions", "arguments"]);
  await Promise.all(
    [...client.stores.values()]
      .filter((store) => apiStores.has(store.name))
      .map((store) => store.loadAll()),
  );

  return { client, ownedEventBus };
}
