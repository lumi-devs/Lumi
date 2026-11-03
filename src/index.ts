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
  createRpcServer,
  handleInteraction,
  handlePrefixMessage,
  isBotOwner,
  isGuildBlacklisted,
  isUserBlacklisted,
  logger,
  redisOptionsFromEnv,
  shutdown,
} from "@lumi/core";
import { connectDatabase, disconnectDatabase, prisma } from "@lumi/db";
import { AddonManager } from "@lumi/downloader";
import type { CommandDefinition } from "@lumi/module-kit";
import { createModuleLoader } from "@lumi/module-runtime";
import { type MetricsServer, startMetricsServer } from "@lumi/observability";
import { createRedisClient } from "@lumi/redis";
import * as ui from "@lumi/ui";
import { PermissionFlagsBits } from "discord.js";
import { createCommandSync } from "./core/commandSync.js";
import { createModuleConfigService } from "./core/moduleConfig.js";
import { CommandRegistry, ModuleHost } from "./core/modules.js";
import {
  createBackupHandler,
  createGuildHandler,
  createModuleStateHandler,
  createPermitNodesHandler,
  createStatusHandler,
} from "./core/rpcRoutes.js";

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
  const {
    permits: permitRepo,
    configService,
    scheduler,
    healthMonitor,
    helpers,
  } = coreServices;

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

  let syncGuildCommands: ((guildId: string) => Promise<void>) | undefined;

  const rpcPort = Number.parseInt(process.env.RPC_HTTP_PORT ?? "8091", 10);
  const rpc = createRpcServer({
    port: rpcPort,
    host: process.env.RPC_HTTP_HOST ?? "0.0.0.0",
    handler: async (req, res) => {
      const statusHandler = createStatusHandler({
        client,
        healthMonitor,
        moduleLoader,
        token: process.env.RPC_INTERNAL_TOKEN,
      });
      const nodesHandler = createPermitNodesHandler({
        moduleLoader,
        permits: permitRepo,
        token: process.env.RPC_INTERNAL_TOKEN,
      });
      const guildHandler = createGuildHandler({
        client,
        token: process.env.RPC_INTERNAL_TOKEN,
      });
      const moduleStateHandler = createModuleStateHandler({
        moduleLoader,
        syncCommands: (guildId) =>
          syncGuildCommands?.(guildId) ?? Promise.resolve(),
        token: process.env.RPC_INTERNAL_TOKEN,
      });
      const backupHandler = createBackupHandler({
        client,
        prisma,
        services: {
          observability: { logger },
        },
        token: process.env.RPC_INTERNAL_TOKEN,
      });

      const url = new URL(
        req.url ?? "/",
        `http://${req.headers.host ?? "localhost"}`,
      );

      if (url.pathname === "/api/v1/permits/nodes") {
        await nodesHandler(req, res);
        return;
      }

      if (
        url.pathname.startsWith("/api/v1/guilds/") &&
        url.pathname.includes("/backups/")
      ) {
        await backupHandler(req, res);
        return;
      }

      if (
        url.pathname.startsWith("/api/v1/guilds/") &&
        url.pathname.includes("/modules/")
      ) {
        await moduleStateHandler(req, res);
        return;
      }

      if (url.pathname.startsWith("/api/v1/guilds/")) {
        await guildHandler(req, res);
        return;
      }

      await statusHandler(req, res);
    },
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

  let addonManager: AddonManager | undefined;

  const services = {
    client,
    configService,
    redis,
    db: {
      prisma,
      permits: permitRepo,
    },
    prisma,
    permits: permitRepo,
    moduleManager,
    modules: {
      isEnabled: (guildId: string, moduleName: string) =>
        moduleLoader.isEnabled(guildId, moduleName),
    },
    moduleLoader,
    scheduler,
    helpers,
    get addons(): AddonManager {
      if (!addonManager) {
        throw new Error(
          "services.addons used before the addon manager was wired",
        );
      }
      return addonManager;
    },
    config: configService,
    moduleConfig: createModuleConfigService({
      loader: moduleLoader,
      config: configService,
    }),
    rpc,
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

  addonManager = new AddonManager({
    prisma,
    redis,
    runtime: host,
    logger,
    notify: createAddonNotifier(client),
  });
  scheduler.register({
    name: "addons-autoupdate",
    cron: "* * * * *",
    handler: async () => {
      await addonManager?.autoUpdate();
    },
  });

  host.addStatic([
    ...(moduleCommands as unknown as CommandDefinition[]),
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

  client.on("interactionCreate", async (interaction) => {
    await handleInteraction(interaction, {
      client,
      registry,
      moduleLoader,
      services,
      logger,
      errorStore,
      createPermitPanel: (guildId, interaction) =>
        new PermitPanel({ permitRepo, guildId, interaction, moduleLoader }),
    });
  });

  client.on("messageCreate", async (message) => {
    if (!message.inGuild()) return;
    if (
      !isBotOwner(message.author.id) &&
      ((await isUserBlacklisted(prisma, helpers.cache, message.author.id)) ||
        (await isGuildBlacklisted(prisma, helpers.cache, message.guildId)))
    ) {
      return;
    }
    await handlePrefixMessage(message, {
      client,
      registry,
      moduleLoader,
      logger,
      services,
    });
  });

  client.on("guildCreate", async (guild) => {
    if (await isGuildBlacklisted(prisma, helpers.cache, guild.id)) {
      await guild.leave().catch(() => undefined);
      return;
    }
    await guildSync.syncRecord(guild);
    await host.load(await moduleLoader.discover());
    await guildSync.syncModules(guild.id);
    await commandSync.syncGuild(guild.id);
  });

  client.on("guildDelete", async (guild) => {
    await commandSync.syncGuild(guild.id);
  });

  client.once("clientReady", async () => {
    for (const guild of client.guilds.cache.values()) {
      await guildSync.syncRecord(guild);
      await guildSync.syncModules(guild.id);
    }
    await commandSync.syncAll();
    await scheduler.start();
  });

  await boot({ token: process.env.BOT_TOKEN ?? "", client });
  logger.info("Lumi v2 is ready!");

  const shutdownSignals = ["SIGINT", "SIGTERM"] as const;
  const runShutdownStep = async (
    name: string,
    action: () => unknown | Promise<unknown>,
  ): Promise<void> => {
    try {
      await action();
    } catch (error) {
      logger.error("Shutdown step failed", { step: name, error });
    }
  };
  for (const signal of shutdownSignals) {
    process.on(signal, async () => {
      logger.info(`Received ${signal}, shutting down...`);
      try {
        await runShutdownStep("metrics", () => metricsServer?.stop());
        await runShutdownStep("scheduler", () => scheduler.stop());
        await runShutdownStep("rpc", () => rpc.stop());
        await runShutdownStep("modules", () => host.unloadAll());
        await runShutdownStep("discord", () => shutdown(client));
        await runShutdownStep("invalidation", () =>
          coreServices.invalidation.close(),
        );
        await runShutdownStep("database", () => disconnectDatabase());
        await runShutdownStep("redis", () => redis.quit());
      } finally {
        process.exit(0);
      }
    });
  }
}

main().catch((error) => {
  logger.error("Fatal error", {
    error,
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  process.exit(1);
});
