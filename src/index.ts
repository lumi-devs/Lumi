import { ModuleManager, moduleCommands, PermitPanel } from "@lumi/admin";
import {
  aboutCommand,
  type BotInteraction,
  boot,
  createClient,
  createCoreServices,
  createRpcServer,
  handleInteraction,
  handlePrefixMessage,
  logger,
  pingCommand,
  redisOptionsFromEnv,
  shutdown,
} from "@lumi/core";
import { connectDatabase, disconnectDatabase, prisma } from "@lumi/db";
import { AddonManager } from "@lumi/downloader";
import { createModuleLoader } from "@lumi/module-runtime";
import {
  activeModules,
  guildsTotal,
  type MetricsServer,
  shardsOnline,
  startMetricsServer,
  usersTotal,
} from "@lumi/observability";
import { createRedisClient } from "@lumi/redis";
import * as ui from "@lumi/ui";
import { PermissionFlagsBits } from "discord.js";
import { createAddonNotifier } from "./core/addonNotify.js";
import { createCommandSync } from "./core/commandSync.js";
import { createGuildSync } from "./core/guildSync.js";
import { CommandRegistry, ModuleHost } from "./core/modules.js";
import { createStatusHandler } from "./core/rpcRoutes.js";


const GuildBatchSize = 10;

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
    permits: permitRepo,
    configService,
    scheduler,
    healthMonitor,
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

  const rpcPort = Number.parseInt(process.env.RPC_HTTP_PORT ?? "8091", 10);
  const rpc = createRpcServer({
    port: rpcPort,
    host: process.env.RPC_HTTP_HOST ?? "0.0.0.0",
    handler: createStatusHandler({
      client,
      healthMonitor,
      moduleLoader,
      token: process.env.RPC_INTERNAL_TOKEN,
    }),
  });
  await rpc.start();
  logger.info("RPC server listening", { port: rpcPort });

  let metricsServer: MetricsServer | undefined;
  if (process.env.METRICS_ENABLED !== "false") {
    const metricsPort = Number.parseInt(process.env.METRICS_PORT ?? "9090", 10);
    metricsServer = startMetricsServer(metricsPort, () => client.isReady(), logger);
  }

  const registry = new CommandRegistry();
  const commandSync = createCommandSync({
    client,
    registry,
    moduleLoader,
    logger,
  });
  const moduleManager = new ModuleManager(
    moduleLoader,
    prisma,
    commandSync.syncGuild,
  );



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
    get addons(): AddonManager {
      if (!addonManager) {
        throw new Error("services.addons used before the addon manager was wired");
      }
      return addonManager;
    },
    config: configService,
    rpc,
    ui,
    discord: { PermissionFlagsBits },
    observability: { healthMonitor, logger },
  };

  const host = new ModuleHost({
    client,
    loader: moduleLoader,
    registry,
    services,
    logger,
    syncCommands: commandSync.syncAll,
  });

  const addons = new AddonManager({
    prisma,
    redis,
    runtime: host,
    logger,
    notify: createAddonNotifier(client),
  });
  addonManager = addons;

  host.addStatic([pingCommand, aboutCommand, ...moduleCommands]);

  const discovered = await moduleLoader.discover();
  logger.info("Discovered modules", { count: discovered.length });

  const loaded = await host.load(discovered);
  logger.info("Loaded modules", {
    count: loaded.length,
    modules: loaded.map((module) => module.manifest.name),
  });
  logger.info("Registered commands", {
    commands: registry.size,
    aliases: registry.aliasCount,
  });

  activeModules.set(loaded.length);

  scheduler.register({
    name: "addons-autoupdate",
    cron: "*/1 * * * *",
    handler: async () => {
      const report = await addons.autoUpdate();
      if (report?.failures.length) {
        logger.warn("Auto-update failed", { failures: report.failures.length });
      }
    },
  });
  await scheduler.start();

  const guildSync = createGuildSync({
    prisma,
    permits: permitRepo,
    moduleLoader,
    logger,
  });

  client.once("clientReady", async () => {
    try {
      guildsTotal.set(client.guilds.cache.size);
      usersTotal.set(client.users.cache.size);
      shardsOnline.set(client.ws.shards.size);
      activeModules.set(moduleLoader.listAll().length);

      const guilds = Array.from(client.guilds.cache.values());
      for (let index = 0; index < guilds.length; index += GuildBatchSize) {
        await Promise.all(
          guilds
            .slice(index, index + GuildBatchSize)
            .map(async (guild) => {

              await Promise.all([
                guildSync.syncRecord(guild),
                guildSync.syncModules(guild.id),
              ]);
              await commandSync.registerGuild(guild);
            }),
        );
      }

      await client.application?.commands.set([]);
      logger.info("Lumi online", {
        user: client.user?.tag,
        guilds: client.guilds.cache.size,
      });
    } catch (error) {
      logger.error("Ready sync failed", { error });
    }
  });

  client.on("guildCreate", (guild) => {
    guildsTotal.set(client.guilds.cache.size);
    void (async () => {
      await Promise.all([
        guildSync.syncRecord(guild),
        guildSync.syncModules(guild.id),
      ]);
      await commandSync.registerGuild(guild);
    })().catch((error) =>
      logger.error("Guild create sync failed", { guildId: guild.id, error }),
    );
  });

  client.on("guildDelete", (guild) => {
    guildsTotal.set(client.guilds.cache.size);
    void prisma.guild
      .update({ where: { id: guild.id }, data: { leftAt: new Date() } })
      .catch((error) =>
        logger.warn("Could not mark guild as left", {
          guildId: guild.id,
          error,
        }),
      );
  });

  client.on("messageCreate", (message) => {
    void handlePrefixMessage(message, {
      client,
      registry,
      moduleLoader,
      services,
      logger,
    }).catch((error) => logger.error("Prefix dispatch failed", { error }));
  });

  client.on("interactionCreate", (interaction) => {
    void handleInteraction(interaction, {
      client,
      registry,
      moduleLoader,
      services,
      logger,
      createPermitPanel: (guildId: string, panelInteraction: BotInteraction) =>
        new PermitPanel({
          permitRepo,
          guildId,
          interaction: panelInteraction,
          moduleLoader,
        }),
    }).catch((error) => logger.error("Interaction dispatch failed", { error }));
  });

  const token = process.env.BOT_TOKEN;
  if (!token) {
    logger.error("BOT_TOKEN is not set");
    process.exit(1);
  }

  let shuttingDown = false;
  const shutdownAll = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info("Shutting down", { signal });



    const steps: Array<[string, () => unknown]> = [
      ["metrics", () => metricsServer?.stop()],
      ["rpc", () => rpc.stop()],
      ["scheduler", () => scheduler.stop()],
      ["modules", () => host.unloadAll()],
      ["discord", () => shutdown(client)],
      ["invalidation", () => coreServices.invalidation.close()],
      ["database", () => disconnectDatabase()],
      ["redis", () => redis.quit()],
    ];
    for (const [step, run] of steps) {
      try {
        await run();
      } catch (error) {
        logger.error("Shutdown step failed", { step, error });
      }
    }

    process.exit(0);
  };


  process.on("SIGINT", () => void shutdownAll("SIGINT"));
  process.on("SIGTERM", () => void shutdownAll("SIGTERM"));

  await boot({ token, client });

  logger.info("Lumi v2 is ready!");
}

main().catch((error) => {
  logger.error("Fatal error", { error });
  process.exit(1);
});
