import { envParseString } from "#lib/env.js";
import type { OwnedEventBus } from "#lib/event-bus/factory.js";
import { createServices, ownedEventBusOf, useServices } from "#lib/services.js";
import type { Client } from "discord.js";

export function installContainerServices(
  client: Client,
  service = envParseString("SERVICE_NAME", "lumi"),
): OwnedEventBus {
  const services = createServices(client, service);
  useServices(services);
  const owned = ownedEventBusOf(services);
  if (!owned) {
    throw new Error(
      "[container-services] createServices did not register an owned event bus",
    );
  }
  return owned;
}
