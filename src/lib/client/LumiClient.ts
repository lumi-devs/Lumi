import { disconnectDatabase } from "#src/lib/prisma/Client.js";
import { getConsumerId } from "#src/lib/Env.js";
import { registerCoreFireHandlers } from "#src/lib/scheduler/CoreHandlers.js";
import { flushAllMessageDeletes } from "#src/lib/discord/Coalesce.js";
import { TaskFireConsumer } from "#src/lib/scheduler/Fires.js";
import { Client } from "discord.js";
import { type Container } from "#src/lib/Services.js";
import {
  dispatchAutocomplete,
  dispatchChatInput,
  dispatchContextMenu,
  dispatchMessage,
} from "#src/lib/commands/CommandDispatch.js";
import { dispatchInteraction } from "#src/lib/interactions/InteractionDispatch.js";
import { registerWorkerProbes } from "#src/lib/client/ReadinessProbes.js";
import { registerCore } from "#src/core/Index.js";
import { registerAdmin } from "#src/admin/Index.js";

export function attachClient(client: Client, services: Container): void {
  services.client = client;
  client.on("messageCreate", (m) => {
    if (!m.author.bot) services.stats.messages++;
  });
}

export async function wireApp(client: Client, services: Container): Promise<void> {
  registerCoreFireHandlers();
  const taskFireConsumer = new TaskFireConsumer(services, services.eventBus, {
    consumerId: getConsumerId(),
  });
  await taskFireConsumer.start();

  await registerCore(services, client);
  await registerAdmin(services);
  await services.moduleStore.discover();
  for (const record of services.moduleStore.all()) {
    if (!record.enabled) continue;
    await services.moduleStore.loadModule(record.name).catch((err: unknown) => {
      services.logger.error(`[LumiClient] Module load failed: ${record.name}`, err);
    });
  }

  client.on("interactionCreate", (interaction) => {
    const run = async (): Promise<void> => {
      if (interaction.isChatInputCommand())
        return dispatchChatInput(services, interaction);
      if (interaction.isAutocomplete())
        return dispatchAutocomplete(services, interaction);
      if (interaction.isMessageContextMenuCommand())
        return dispatchContextMenu(services, interaction);
      return dispatchInteraction(services, interaction);
    };
    void run().catch((error: unknown) => {
      services.logger.error("[InteractionDispatch] dispatch failed:", error);
    });
  });

  client.on("messageCreate", (message) => {
    void dispatchMessage(services, client, message).catch((error: unknown) => {
      services.logger.error("[CommandDispatch] prefix dispatch failed:", error);
    });
  });

  registerWorkerProbes(client);
}

export async function loginLumi(
  client: Client,
  services: Container,
  token?: string,
): Promise<string> {
  await wireApp(client, services);
  await services.prisma.$connect();
  const res = await client.login(token);
  await client.application?.fetch().catch(() => undefined);
  return res;
}

export async function destroyLumi(
  client: Client,
  _services: Container,
): Promise<void> {
  await client.destroy().catch(() => undefined);
  await flushAllMessageDeletes().catch(() => undefined);
  await disconnectDatabase().catch(() => undefined);
}
