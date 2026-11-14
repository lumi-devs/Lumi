import { Time } from "@shared/Index.ts";
import { disconnectDatabase } from "@db/Client.js";
import { getConsumerId } from "@lib/Env.js";
import { registerCoreFireHandlers } from "@scheduler/CoreHandlers.js";
import { flushAllMessageDeletes } from "@discord/Coalesce.js";
import { TaskFireConsumer } from "@scheduler/Fires.js";
import type { OwnedEventBus } from "@event-bus/Factory.js";
import { Client } from "discord.js";
import { ownedEventBusOf, type Container } from "@lib/Services.js";
import { installProducerOnlyTasks } from "@scheduler/Producer.js";
import { dispatchInteraction } from "@interactions/InteractionDispatch.js";
import {
  dispatchAutocomplete,
  dispatchChatInput,
  dispatchContextMenu,
  dispatchMessage,
} from "@commands/CommandDispatch.js";
import { registerWorkerProbes } from "@lib/client/ReadinessProbes.js";

interface ClientState {
  ownedEventBus: OwnedEventBus | null;
  taskFireConsumer: TaskFireConsumer | null;
  livenessInterval: ReturnType<typeof setInterval> | null;
}

const clientStates = new WeakMap<Client, ClientState>();

function stateOf(client: Client): ClientState {
  let state = clientStates.get(client);
  if (!state) {
    state = {
      ownedEventBus: null,
      taskFireConsumer: null,
      livenessInterval: null,
    };
    clientStates.set(client, state);
  }
  return state;
}

export function attachClient(client: Client, services: Container): void {
  services.client = client;
  installProducerOnlyTasks(services);
  stateOf(client).ownedEventBus = ownedEventBusOf(services) ?? null;
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
  stateOf(client).taskFireConsumer = taskFireConsumer;

  await services.moduleStore.discover();
  await services.moduleStore.loadSharedUtilities();
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
      if (interaction.isMessageContextMenuCommand()) {
        return dispatchContextMenu(services, interaction);
      }
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

export async function connectGateway(
  client: Client,
  services: Container,
  token?: string,
): Promise<string> {
  await services.prisma.$connect();
  await services.invalidation.start();
  await services.signals.start();

  const result = await client.login(token);

  await client.application?.fetch().catch((err: unknown) => {
    services.logger.warn(
      "[LumiClient] Failed to fetch Discord application info:",
      err,
    );
  });

  stateOf(client).livenessInterval = setInterval(async () => {
    try {
      await services.db.probePrisma();
    } catch (err: unknown) {
      services.logger.error("[Database] Liveness check failed:", err);
    }
  }, Time.Minute);

  return result;
}

export async function loginLumi(
  client: Client,
  services: Container,
  token?: string,
): Promise<string> {
  await wireApp(client, services);
  return connectGateway(client, services, token);
}

export async function destroyLumi(
  client: Client,
  services: Container,
): Promise<void> {
  const warnOnCleanupError = (what: string) => (err: unknown) =>
    services.logger.warn(`[Client] ${what} failed:`, err);
  const state = stateOf(client);
  if (state.livenessInterval) {
    clearInterval(state.livenessInterval);
    state.livenessInterval = null;
  }
  if (services.tasks) {
    await services.tasks
      .close()
      .catch(warnOnCleanupError("ScheduledTasks (BullMQ) close"));
  }
  if (state.taskFireConsumer) {
    await state.taskFireConsumer
      .stopConsuming()
      .catch(warnOnCleanupError("TaskFireConsumer stop"));
    state.taskFireConsumer = null;
  }
  await client.destroy().catch(warnOnCleanupError("Client destroy"));
  await flushAllMessageDeletes().catch(
    warnOnCleanupError("flushAllMessageDeletes"),
  );
  const owned = state.ownedEventBus ?? ownedEventBusOf(services);
  await owned?.close().catch(warnOnCleanupError("EventBus close"));
  state.ownedEventBus = null;
  await services.invalidation
    .close()
    .catch(warnOnCleanupError("Invalidation close"));
  await services.signals.close().catch(warnOnCleanupError("Signals close"));
  await services.redis.quit().catch(warnOnCleanupError("Redis quit"));
  await disconnectDatabase().catch(warnOnCleanupError("Database disconnect"));
}
