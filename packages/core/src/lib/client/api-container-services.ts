import { buildRestOptions } from "#lib/discord/options.js";
import { envParseString, getBotToken } from "#lib/env.js";
import { container } from "#lib/services.js";
import type { OwnedEventBus } from "#lib/event-bus/factory.js";
import { Client } from "discord.js";
import { Routes, type APIUser } from "discord-api-types/v10";
import { installContainerServices } from "./container-services.js";

export interface ApiContainerServices {
  client: Client;
  ownedEventBus: OwnedEventBus;
}

export async function installApiContainerServices(): Promise<ApiContainerServices> {
  const client = new Client({
    intents: [],
    rest: buildRestOptions(),
  });

  const ownedEventBus = installContainerServices(
    client,
    envParseString("SERVICE_NAME", "lumi-api"),
  );

  client.rest.setToken(getBotToken());
  const me = (await client.rest.get(Routes.user())) as APIUser;
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
    container.logger.warn("[Api] Failed to fetch application info for bot owner check:", err);
  }

  await container.moduleStore.discover();
  for (const record of container.moduleStore.all()) {
    if (!record.enabled) continue;
    await container.moduleStore.loadModule(record.name).catch((err: unknown) => {
      container.logger.error(`[Api] Module load failed: ${record.name}`, err);
    });
  }

  return { client, ownedEventBus };
}
