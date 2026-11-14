import { ModuleManager, moduleCommands, PermitPanel } from "@lumi/admin";
import {
  boot,
  createAboutCommand,
  createAddonNotifier,
  createClient,
  createCoreServices,
  createDataLifecycleService,
  createErrorStore,
  createGuildSync,
  createHelpCommand,
  createOwnerCommands,
  createPingCommand,
  createRpcRouter,
  createRpcServer,
  errorMessage,
  logger,
  redisOptionsFromEnv,
  registerClientEvents,
  registerShutdownHandlers,
  shutdown,
} from "@lumi/core";
import { connectDatabase, disconnectDatabase } from "@lumi/db";
import { AddonManager } from "@lumi/downloader";
import { createModuleLoader } from "@lumi/module-runtime";
import { type MetricsServer, startMetricsServer } from "@lumi/observability";
import { createRedisClient } from "@lumi/redis";
import * as ui from "@lumi/ui";
import { PermissionFlagsBits } from "discord.js";
import {
  createCommandSync,
  type SyncGuildCommands,
} from "./core/commandSync.js";
import type { BotServices } from "./core/contracts.js";
import { createModuleConfigService } from "./core/moduleConfig.js";
import { CommandRegistry, ModuleHost } from "./core/modules.js";

async function main(): Promise<void> {
  logger.info("Starting Lumi v2...");

  const redis = createRedisClient(redisOptionsFromEnv());
  redis.on("error", (error) =>
    logger.error("Redis error", { error: error.message }),
  );
  await redis.connect();
  logger.info("Connected to Redis");

  await connectDatabase();
  logger.info("Connected to Database");

  const client = createClient();
  const coreServices = createCoreServices({ client, redis });
  const {
    prisma,
    permits: permitRepo,
    configService,
    scheduler,
    healthMonitor,
    helpers,
  } = coreServices;
  const errorStore = createErrorStore(redis);

  process.on("unhandledRejection", (error) => {
    logger.error("Unhandled rejection", { error });
    void errorStore.record({ error, source: "unhandledRejection" });
  });
  process.on("uncaughtException", (error) => {
    logger.error("Uncaught exception", { error });
    void errorStore
      .record({ error, source: "uncaughtException" })
      .finally(() => process.exit(1));
  });

  healthMonitor.register({
    name: "redis",
    check: async () => ({
      healthy: redis.status === "ready",
      details: redis.status,
    }),
  });
  healthMonitor.register({
    name: "discord",
    check: async () => ({
      healthy: client.isReady(),
      details: client.user?.tag ?? "not ready",
    }),
  });

  const moduleLoader = createModuleLoader();
  moduleLoader.addRoot("modules", "bundled");
  moduleLoader.addRoot("data/addons", "addon");

  let syncGuildCommands: SyncGuildCommands | undefined;
  const rpcPort = Number.parseInt(process.env.RPC_HTTP_PORT ?? "8091", 10);
  const rpc = createRpcServer({
    port: rpcPort,
    host: process.env.RPC_HTTP_HOST ?? "127.0.0.1",
    handler: createRpcRouter({
      client,
      prisma,
      healthMonitor,
      moduleLoader,
      permits: permitRepo,
      logger,
      token: process.env.RPC_INTERNAL_TOKEN,
      getSyncGuildCommands: () => syncGuildCommands,
    }),
  });
  await rpc.start();
  logger.info("RPC server listening", { port: rpcPort });

  let metricsServer: MetricsServer | undefined;
  if (process.env.METRICS_ENABLED !== "false") {
    const metricsPort = Number.parseInt(process.env.METRICS_PORT ?? "9090", 10);
    metricsServer = startMetricsServer(
      metricsPort,
      () => client.isReady(),
      logger,
    );
  }

  const registry = new CommandRegistry();
  const commandSync = createCommandSync({
    client,
    registry,
    moduleLoader,
    logger,
  });
  syncGuildCommands = commandSync.syncGuild;
  const moduleManager = new ModuleManager(
    moduleLoader,
    prisma,
    commandSync.syncGuild,
  );
  const guildSync = createGuildSync({
    prisma,
    permits: permitRepo,
    moduleLoader,
    logger,
  });

  const runtimeRef: { host?: ModuleHost } = {};
  const addonManager = new AddonManager({
    prisma,
    redis,
    logger,
    notify: createAddonNotifier(client),
    runtime: () => {
      if (!runtimeRef.host) {
        throw new Error(
          "Add-on runtime requested before the module host exists.",
        );
      }
      return runtimeRef.host;
    },
  });

  const services: BotServices = {
    client,
    redis,
    prisma,
    helpers,
    configService,
    permits: permitRepo,
    scheduler,
    moduleLoader,
    moduleManager,
    addons: addonManager,
    moduleConfig: createModuleConfigService({
      loader: moduleLoader,
      config: configService,
    }),
    modules: {
      isEnabled: (guildId, moduleName) =>
        moduleLoader.isEnabled(guildId, moduleName),
    },
    ui,
    discord: { PermissionFlagsBits },
    observability: { healthMonitor, logger },
  };

  const dataLifecycle = createDataLifecycleService({
    loader: moduleLoader,
    services,
  });

  const host = new ModuleHost({
    client,
    loader: moduleLoader,
    registry,
    services,
    logger,
    syncCommands: () => commandSync.syncAll(),
  });
  runtimeRef.host = host;

  scheduler.register({
    name: "addons-autoupdate",
    cron: "* * * * *",
    handler: async () => {
      await addonManager.autoUpdate();
    },
  });

  host.addStatic([
    ...moduleCommands,
    createAboutCommand({ client, prisma, redis }),
    createPingCommand({ client, prisma }),
    createHelpCommand({
      registry,
      loader: moduleLoader,
      permits: permitRepo,
      configService,
      client,
    }),
    ...createOwnerCommands({
      client,
      prisma,
      cache: helpers.cache,
      configService,
      dataLifecycle,
      errorStore,
    }),
  ]);

  await host.load(await moduleLoader.discover());

  registerClientEvents({
    client,
    registry,
    moduleLoader,
    services,
    logger,
    errorStore,
    host,
    commandSync,
    guildSync,
    scheduler,
    createPermitPanel: (guildId, interaction) =>
      new PermitPanel({ permitRepo, guildId, interaction, moduleLoader }),
  });

  await boot({ token: process.env.BOT_TOKEN ?? "", client });
  logger.info("Lumi v2 is ready!");

  registerShutdownHandlers(logger, [
    { name: "metrics", action: () => metricsServer?.stop() },
    { name: "scheduler", action: () => scheduler.stop() },
    { name: "rpc", action: () => rpc.stop() },
    { name: "modules", action: () => host.unloadAll() },
    { name: "discord", action: () => shutdown(client) },
    { name: "invalidation", action: () => coreServices.invalidation.close() },
    { name: "database", action: () => disconnectDatabase() },
    { name: "redis", action: () => redis.quit() },
  ]);
}

main().catch((error) => {
  logger.error("Fatal error", {
    error,
    message: errorMessage(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  process.exit(1);
});
