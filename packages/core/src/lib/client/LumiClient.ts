import { Ms } from "@lumi/shared";
import { disconnectDatabase } from "#lib/prisma/client.js";
import { getConsumerId } from "#lib/env.js";
import { registerCoreFireHandlers } from "#lib/core-fire-handlers.js";
import { flushAllMessageDeletes } from "#lib/rest-coalesce.js";
import { TaskFireConsumer } from "#lib/task-fire-registry.js";
import type { OwnedEventBus } from "#lib/event-bus/factory.js";
import { Client } from "discord.js";
import { ownedEventBusOf, type Container } from "#lib/services.js";
import { repositoryCache } from "#lib/prisma/repositories/Repository.js";
import { buildClientOptions } from "./client-options.js";
import { installProducerOnlyTasks } from "./scheduler-producer.js";
import { dispatchInteraction } from "#lib/interactions/interaction-dispatch.js";
import {
  dispatchAutocomplete,
  dispatchChatInput,
  dispatchContextMenu,
  dispatchMessage,
} from "#lib/commands/command-dispatch.js";
import { registerWorkerProbes } from "./ReadinessProbes.js";

interface ClientState {
  ownedEventBus: OwnedEventBus | null;
  taskFireConsumer: TaskFireConsumer | null;
  repositoryCacheUnbind: (() => void) | null;
  livenessInterval: ReturnType<typeof setInterval> | null;
}

const clientStates = new WeakMap<Client, ClientState>();

function stateOf(client: Client): ClientState {
  let state = clientStates.get(client);
  if (!state) {
    state = {
      ownedEventBus: null,
      taskFireConsumer: null,
      repositoryCacheUnbind: null,
      livenessInterval: null,
    };
    clientStates.set(client, state);
  }
  return state;
}

/**
 * Points an explicit service bag at a client and wires the per-client
 * attachments the old constructor did: producer-only task queue,
 * repository-cache invalidation binding, and the message counter.
 * Shared by `createClient` and the worker bootstrap (which must build
 * services around an already-created client).
 */
export function attachClient(client: Client, services: Container): void {
  services.client = client;
  installProducerOnlyTasks(services);
  const state = stateOf(client);
  state.ownedEventBus = ownedEventBusOf(services) ?? null;
  state.repositoryCacheUnbind = repositoryCache.attachToInvalidationBus(
    services.invalidation,
  );
  client.on("messageCreate", (m) => {
    if (!m.author.bot) services.stats.messages++;
  });
}

export function createClient(services: Container): Client {
  const client = new Client(buildClientOptions());
  attachClient(client, services);
  return client;
}

/**
 * Pre-gateway wiring: module discover + load loop, interaction/message
 * handler registration, fire handlers, task-fire consumer, readiness probes.
 */
export async function wireApp(client: Client, services: Container): Promise<void> {
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

  registerCoreFireHandlers();
  const taskFireConsumer = new TaskFireConsumer(services, services.eventBus, {
    consumerId: getConsumerId(),
  });
  await taskFireConsumer.start();
  stateOf(client).taskFireConsumer = taskFireConsumer;

  registerWorkerProbes(client);
}

/**
 * THE future gateway-proxy seam: the single place that opens the gateway
 * connection. Multi-bot = two service bags + two clients, both funneled here.
 */
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
  }, Ms.Minute);

  return result;
}

/**
 * Preserves the old `login` order across the split point: `wireApp`
 * (discover → handlers → fire/task/probes) runs first, then `connectGateway`
 * (prisma/invalidation/signals → login → fetch → liveness).
 *
 * NOTE: this inverts two adjacencies of the old order — module
 * discover/load and the task-fire/probe registration now run BEFORE the
 * prisma `$connect` and invalidation/signals `start()`, whereas the old
 * constructor-login ran prisma/invalidation/signals first. Safe in practice
 * (Prisma connects lazily on first query; the Valkey clients used by the
 * event bus connect lazily too), but flagging for review.
 */
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
  if (state.repositoryCacheUnbind) {
    state.repositoryCacheUnbind();
    state.repositoryCacheUnbind = null;
  }
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
  await services.valkey.quit().catch(warnOnCleanupError("Valkey quit"));
  await disconnectDatabase().catch(warnOnCleanupError("Database disconnect"));
}
