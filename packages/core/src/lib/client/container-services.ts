import { envParseString } from "@lumi/lib/env.js";
import type { OwnedEventBus } from "@lumi/lib/event-bus/factory.js";
import { createServices, ownedEventBusOf, useServices } from "@lumi/lib/services.js";
import { installProducerOnlyTasks } from "@lumi/lib/scheduler/producer.js";
import { repositoryCache } from "@lumi/lib/cache/cache-store.js";
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
