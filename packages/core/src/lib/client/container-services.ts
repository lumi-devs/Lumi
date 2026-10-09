import { envParseString } from "#lib/env.js";
import type { OwnedEventBus } from "#lib/event-bus/factory.js";
import { createServices, ownedEventBusOf, useServices } from "#lib/services.js";
import { installProducerOnlyTasks } from "#lib/scheduler/producer.js";
import { repositoryCache } from "#lib/cache/CacheStore.js";
import type { Client } from "discord.js";

export function installContainerServices(
  client: Client,
  service = envParseString("SERVICE_NAME", "lumi"),
): OwnedEventBus {
  const services = createServices(client, service);
  installProducerOnlyTasks(services);
  repositoryCache.attachToInvalidationBus(services.invalidation);
  useServices(services);
  const owned = ownedEventBusOf(services);
  if (!owned) {
    throw new Error(
      "[container-services] createServices did not register an owned event bus",
    );
  }
  return owned;
}
