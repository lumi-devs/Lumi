import { PermissionFlagsBits, type Guild } from "discord.js";
import { createRedisClient } from "@lumi/redis";
import { connectDatabase, disconnectDatabase, prisma } from "@lumi/db";
import { createModuleLoader } from "@lumi/module-runtime";
import { AddonManager } from "@lumi/downloader";
import {
  activeModules,
  guildsTotal,
  httpRequestDuration,
  httpRequests,
  shardsOnline,
  startMetricsServer,
  usersTotal,
} from "@lumi/observability";
import * as ui from "@lumi/ui";
import {
  aboutCommand,
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
  type BotInteraction,
} from "@lumi/core";
import { ModuleManager, PermitPanel, moduleCommands } from "@lumi/admin";
import {
  CommandRegistry,
  ModuleHost,
  commandPayloadForGuild,
} from "./core/modules.js";

async function main() {
  logger.info("Starting Lumi v2...");

  const redis = createRedisClient(redisOptionsFromEnv());
  redis.on("error", (error) => logger.error("Redis error", { error: error.message }));
  await redis.connect();
  logger.info("Connected to Redis");

  await connectDatabase();
  logger.info("Connected to Database");

  const client = createClient();
  const core = createCoreServices({ client, redis });
  const { permits: permitRepo, configService, scheduler, healthMonitor } = core;

  healthMonitor.register({
    name: "redis",
    check: async () => ({ healthy: redis.status === "ready", details: redis.status }),
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
  const rpcToken = process.env.RPC_INTERNAL_TOKEN;
  const rpc = createRpcServer({
    port: rpcPort,
    host: process.env.RPC_HTTP_HOST ?? "0.0.0.0",
    handler: async (req, res) => {
      const started = performance.now();
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
      const route = url.pathname;
      const method = req.method ?? "GET";

      const finish = (status: number, body: unknown) => {
        const seconds = (performance.now() - started) / 1000;
        httpRequests.inc({ method, route, status: String(status) });
        httpRequestDuration.observe({ method, route, status: String(status) }, seconds);
        res.setHeader("content-type", "application/json");
        res.statusCode = status;
        res.end(JSON.stringify(body));
      };

      if (route === "/healthz") {
        const checks = await healthMonitor.runChecks();
        return finish(checks.healthy ? 200 : 503, {
          ok: checks.healthy,
          ready: client.isReady(),
          checks: checks.results,
        });
      }

      if (route === "/ready" || route === "/readyz") {
        return finish(client.isReady() ? 200 : 503, { ready: client.isReady() });
      }

      if (route === "/api/v1/status") {
        if (rpcToken && req.headers.authorization !== `Bearer ${rpcToken}`) {
          return finish(401, { error: "unauthorized" });
        }
        return finish(200, {
          bot: client.user?.tag ?? null,
          guilds: client.guilds.cache.size,
          users: client.users.cache.size,
          modules: moduleLoader.listGlobal(),
        });
      }

      finish(404, { error: "not found" });
    },
  });
  await rpc.start();
  logger.info("RPC server listening", { port: rpcPort });

  let metricsServer: { stop(): void } | undefined;
  if (process.env.METRICS_ENABLED !== "false") {
    const metricsPort = Number.parseInt(process.env.METRICS_PORT ?? "9090", 10);
    metricsServer = startMetricsServer(metricsPort, () => client.isReady(), logger);
  }

  const registry = new CommandRegistry();
  const commandPayload = (guildId: string) =>
    commandPayloadForGuild(registry, moduleLoader, guildId);

  const registerGuildCommands = async (guild: Guild) => {
    const payload = commandPayload(guild.id);
    try {
      await guild.commands.set(payload);
      logger.info("Registered commands in guild", {
        guildId: guild.id,
        commands: payload.length,
      });
    } catch (error) {
      logger.error("Failed to register commands", { guildId: guild.id, error });
    }
  };

  const syncGuildCommands = async (guildId: string) => {
    const guild = client.guilds.cache.get(guildId);
    if (guild) await registerGuildCommands(guild);
  };

  const syncAllGuildCommands = async () => {
    const guildIds = Array.from(client.guilds.cache.keys());
    const batchSize = 10;
    for (let index = 0; index < guildIds.length; index += batchSize) {
      await Promise.all(
        guildIds.slice(index, index + batchSize).map((guildId) =>
          syncGuildCommands(guildId),
        ),
      );
    }
  };

  const moduleManager = new ModuleManager(moduleLoader, prisma, syncGuildCommands);

  // AddonManager needs the ModuleHost, and the host needs the service bag, so the
  // manager is attached after construction. Modules resolve it lazily on use.
  let addonManager: AddonManager | undefined;

  const services = {
    client,
    configService,
    redis,
    // ConfigService owns the cache "config" namespace and invalidates it on
    // every write; no other namespace has a consumer in the process today.
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
    syncCommands: syncAllGuildCommands,
  });

  const addons = new AddonManager({
    prisma,
    redis,
    runtime: host,
    logger,
    notify: async (report) => {
      const ownerIds = (process.env.OWNER_IDS ?? "")
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);
      if (ownerIds.length === 0) return;

      const lines = [
        "**Add-on auto-update**",
        ...report.updated.map((name) => `✅ Updated ${name}`),
        ...report.failures.map((failure) => `❌ ${failure.module}: ${failure.error}`),
      ];
      for (const ownerId of ownerIds) {
        const user = await client.users.fetch(ownerId).catch(() => null);
        await user?.send(lines.join("\n")).catch(() => undefined);
      }
    },
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

  const syncGuildModules = async (guildId: string) => {
    let rows: Array<{ module: string; enabled: boolean }> = [];
    try {
      rows = await prisma.guildModule.findMany({ where: { guildId } });
    } catch (error) {
      logger.warn("Could not load guild module state, defaulting to enabled", {
        guildId,
        error,
      });
    }
    const state = new Map(rows.map((row) => [row.module, row.enabled] as const));
    await Promise.all(
      moduleLoader.listAll().map((module) =>
        moduleLoader.setEnabled(
          module.manifest.name,
          guildId,
          state.get(module.manifest.name) ?? true,
        ),
      ),
    );
  };

  const syncGuildRecord = async (guild: Guild) => {
    try {
      await prisma.guild.upsert({
        where: { id: guild.id },
        update: {
          name: guild.name,
          icon: guild.iconURL({ size: 128 }),
          ownerId: guild.ownerId,
          leftAt: null,
        },
        create: {
          id: guild.id,
          name: guild.name,
          icon: guild.iconURL({ size: 128 }),
          ownerId: guild.ownerId,
        },
      });
      await permitRepo.seedBuiltinPermits(guild.id);
    } catch (error) {
      logger.warn("Could not sync guild", { guildId: guild.id, error });
    }
  };

  client.once("clientReady", async () => {
    try {
      guildsTotal.set(client.guilds.cache.size);
      usersTotal.set(client.users.cache.size);
      shardsOnline.set(client.ws.shards.size);
      activeModules.set(moduleLoader.listAll().length);

      // Bound concurrency: each guild performs three DB/API round-trips.
      const guilds = Array.from(client.guilds.cache.values());
      const batchSize = 10;
      for (let index = 0; index < guilds.length; index += batchSize) {
        await Promise.all(
          guilds.slice(index, index + batchSize).map(async (guild) => {
            // Module state must settle before command visibility is computed.
            await Promise.all([syncGuildRecord(guild), syncGuildModules(guild.id)]);
            await registerGuildCommands(guild);
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
      await Promise.all([syncGuildRecord(guild), syncGuildModules(guild.id)]);
      await registerGuildCommands(guild);
    })().catch((error) =>
      logger.error("Guild create sync failed", { guildId: guild.id, error }),
    );
  });

  client.on("guildDelete", (guild) => {
    guildsTotal.set(client.guilds.cache.size);
    void prisma.guild
      .update({ where: { id: guild.id }, data: { leftAt: new Date() } })
      .catch((error) =>
        logger.warn("Could not mark guild as left", { guildId: guild.id, error }),
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
  const shutdownAll = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info("Shutting down", { signal });

    const steps: Array<[string, () => unknown]> = [
      ["metrics", () => metricsServer?.stop()],
      ["rpc", () => rpc.stop()],
      ["scheduler", () => scheduler.stop()],
      ["modules", () => host.unloadAll()],
      ["discord", () => shutdown(client)],
      ["invalidation", () => core.invalidation.close()],
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

  // Register before login so a signal during boot still drains cleanly.
  process.on("SIGINT", () => void shutdownAll("SIGINT"));
  process.on("SIGTERM", () => void shutdownAll("SIGTERM"));

  await boot({ token, client });

  logger.info("Lumi v2 is ready!");
}

main().catch((error) => {
  logger.error("Fatal error", { error });
  process.exit(1);
});
