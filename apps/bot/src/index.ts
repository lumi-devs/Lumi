import { createClient, createCoreServices, createRpcServer, boot, shutdown, pingCommand, handlePingButton, handlePingClose } from "@lumi/core";
import { createModuleLoader } from "@lumi/module-runtime";
import { createRedisClient, InvalidationBus } from "@lumi/redis";
import { createCache } from "@lumi/cache";
import { prisma, connectDatabase, disconnectDatabase } from "@lumi/db";
import { PermitRepository } from "@lumi/permits";
import { ModuleManager, moduleCommands, PermitPanel, HubPanel, ModulePanel, SettingsPanel, ConfigService } from "@lumi/admin";
import { PermissionFlagsBits } from "discord.js";
import * as ui from "@lumi/ui";
import { VerificationService, PanicService, AntiNukeService, JoinGateService } from "@lumi/security";
import { DistributedScheduler } from "@lumi/scheduler";
import {
  activeModules,
  commandsExecuted,
  createHealthMonitor,
  guildsTotal,
  httpRequestDuration,
  httpRequests,
  registry,
  shardsOnline,
  startMetricsServer,
  usersTotal,
} from "@lumi/observability";
import type {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
} from "discord.js";

interface RegisteredCommand {
  data: any;
  execute: (interaction: ChatInputCommandInteraction, services: any) => Promise<void>;
  autocomplete?: (interaction: AutocompleteInteraction, services: any) => Promise<void>;
  module: string | null;
}

const logger = {
  info: (msg: string, meta?: any) => console.log(msg, meta ?? ""),
  warn: (msg: string, meta?: any) => console.warn(msg, meta ?? ""),
  error: (msg: string, meta?: any) => console.error(msg, meta ?? ""),
  debug: (msg: string, meta?: any) => {
    if (process.env.LOG_LEVEL === "debug") console.debug(msg, meta ?? "");
  },
};

async function main() {
  console.log("Starting Lumi v2...");

  const redis = createRedisClient({
    host: process.env.REDIS_HOST ?? "localhost",
    port: Number(process.env.REDIS_PORT ?? 6379),
    password: process.env.REDIS_PASSWORD,
  });
  redis.on("error", (err) => logger.error("Redis error:", err.message));

  await redis.connect();
  console.log("Connected to Redis");

  await connectDatabase();
  console.log("Connected to Database");

  const invalidation = new InvalidationBus(redis);
  const cache = createCache({
    redis,
    invalidation,
    defaultTtlMs: 60_000,
    defaultNegativeTtlMs: 15_000,
  });

  const client = createClient();
  createCoreServices(client, redis);

  const permitRepo = new PermitRepository(prisma, redis);

  const moduleLoader = createModuleLoader();
  moduleLoader.addRoot("modules", "bundled");
  moduleLoader.addRoot("data/addons", "addon");

  const verification = new VerificationService(prisma, redis);
  const panic = new PanicService(prisma, redis);
  const antinuke = new AntiNukeService(prisma);
  const joingate = new JoinGateService(prisma);
  const scheduler = new DistributedScheduler(redis);
  const healthMonitor = createHealthMonitor();
  const moduleManager = new ModuleManager(moduleLoader, prisma);

  healthMonitor.register({
    name: "redis",
    check: async () => ({ healthy: redis.status === "ready", details: redis.status }),
  });
  healthMonitor.register({
    name: "discord",
    check: async () => ({ healthy: client.isReady(), details: client.user?.tag ?? "not ready" }),
  });

  const rpcPort = parseInt(process.env.RPC_HTTP_PORT ?? "8091");
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

      if (route === "/healthz" || route === "/livez") {
        const checks = await healthMonitor.runChecks();
        return finish(checks.healthy ? 200 : 503, {
          ok: checks.healthy,
          ready: client.isReady(),
          checks: checks.results,
        });
      }

      if (route === "/readyz") {
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
  console.log(`RPC server listening on :${rpcPort}`);

  let metricsServer: { stop(): void } | undefined;
  if (process.env.METRICS_ENABLED !== "false") {
    const metricsPort = parseInt(process.env.METRICS_PORT ?? "9090");
    metricsServer = startMetricsServer(metricsPort, () => client.isReady(), logger);
    console.log(`Metrics server started on :${metricsPort}`);
  }

  const configService = new ConfigService(prisma);

  const services = {
    client,
    configService,
    redis,
    cache,
    db: {
      prisma,
      permits: permitRepo,
    },
    prisma,
    permits: permitRepo,
    moduleManager,
    modules: {
      isEnabled: (guildId: string, moduleName: string) => moduleLoader.isEnabled(guildId, moduleName),
    },
    moduleLoader,
    security: { verification, panic, antinuke, joingate },
    scheduler,
    config: {
      get: async (guildId: string, key: string) => {
        const guild = await prisma.guild.findUnique({
          where: { id: guildId },
          select: { settings: true },
        });
        return (guild?.settings as any)?.[key];
      },
      set: async (guildId: string, key: string, value: any) => {
        await prisma.guild.update({
          where: { id: guildId },
          data: { settings: { set: { [key]: value } } },
        });
      },
    },
    rpc,
    ui,
    discord: {
      PermissionFlagsBits: (await import("discord.js")).PermissionFlagsBits,
    },
    observability: { healthMonitor },
  };

  const discovered = await moduleLoader.discover();
  console.log(`Discovered ${discovered.length} modules`);

  const loaded = await moduleLoader.loadAll(discovered, services);
  console.log(`Loaded ${loaded.length} modules: ${loaded.map((m) => m.manifest.name).join(", ") || "(none)"}`);

  activeModules.set(loaded.length);

  for (const module of loaded) {
    for (const listener of module.definition.listeners ?? []) {
      const handler = listener.handler;
      const register = listener.once ? client.once.bind(client) : client.on.bind(client);
      register(listener.event as any, (...args: any[]) => {
        void handler(...args, services).catch((err) =>
          logger.error(`[${module.manifest.name}] listener ${listener.event} failed:`, err)
        );
      });
    }
  }

  const commandRegistry = new Map<string, RegisteredCommand>();

  commandRegistry.set("ping", { ...pingCommand, module: null });

  for (const cmd of moduleCommands) {
    commandRegistry.set(cmd.data.name, { ...cmd, module: null });
  }

  for (const module of loaded) {
    for (const cmd of module.definition.commands ?? []) {
      const name = cmd.data.name;
      if (commandRegistry.has(name)) {
        logger.warn(`Command collision: /${name} already registered, skipping from module ${module.manifest.name}`);
        continue;
      }
      commandRegistry.set(name, { ...cmd, module: module.manifest.name });
    }
  }

  console.log(`Registered ${commandRegistry.size} commands`);

  const syncGuildModules = async (guildId: string) => {
    let rows: any[] = [];
    try {
      rows = await prisma.guildModule.findMany({ where: { guildId } });
    } catch (err) {
      logger.warn("Could not load guild module state, defaulting to enabled:", err);
    }
    for (const module of loaded) {
      const row = (rows ?? []).find((r: any) => r.module === module.manifest.name);
      const defaultEnabled = (module.manifest as any).defaultEnabled !== false;
      const enabled = row ? Boolean(row.enabled) : defaultEnabled;
      await moduleLoader.setEnabled(module.manifest.name, guildId, enabled);
    }
  };

  const registerGuildCommands = async (guild: any) => {
    const payload = Array.from(commandRegistry.values()).map((c) => c.data.toJSON());
    try {
      await guild.commands.set(payload);
      logger.info(`Registered ${payload.length} commands in guild ${guild.name} (${guild.id})`);
    } catch (err) {
      logger.error(`Failed to register commands in guild ${guild.id}:`, err);
    }
  };

  client.once("ready", async () => {
    guildsTotal.set(client.guilds.cache.size);
    usersTotal.set(client.users.cache.size);
    shardsOnline.set(client.ws.shards.size);
    activeModules.set(loaded.length);

    for (const guild of client.guilds.cache.values()) {
      await syncGuildModules(guild.id);
      await registerGuildCommands(guild);
    }

    try {
      await client.application?.commands.set([]);
    } catch (err) {
      logger.debug("Could not clear global commands:", err);
    }

    console.log(`Lumi online as ${client.user?.tag} in ${client.guilds.cache.size} guild(s)`);
  });

  client.on("guildCreate", async (guild) => {
    guildsTotal.set(client.guilds.cache.size);
    await syncGuildModules(guild.id);
    await registerGuildCommands(guild);
  });

  client.on("guildDelete", () => {
    guildsTotal.set(client.guilds.cache.size);
  });

  const activePanels = new Map<string, PermitPanel>();

  const getPanel = (guildId: string, interaction: any) => {
    let panel = activePanels.get(guildId);
    if (!panel) {
      panel = new PermitPanel({ prisma, redis, guildId, interaction });
      activePanels.set(guildId, panel);
    }
    return panel;
  };

  client.on("interactionCreate", async (interaction) => {
    try {
      if (interaction.isAutocomplete()) {
        const command = commandRegistry.get(interaction.commandName);
        if (command?.autocomplete) {
          await command.autocomplete(interaction, services);
        } else {
          await interaction.respond([]).catch(() => undefined);
        }
        return;
      }

      if (interaction.isChatInputCommand()) {
        const command = commandRegistry.get(interaction.commandName);
        if (!command) {
          await interaction.reply(ui.ephemeralCard(ui.makeErrorCard("Unknown Command", "That command is not registered."))).catch(() => undefined);
          return;
        }

        if (command.module && interaction.guildId) {
          const enabled = moduleLoader.isEnabled(interaction.guildId, command.module);
          if (!enabled) {
            await interaction
              .reply(
                ui.ephemeralCard(
                  ui.makeErrorCard(
                    "Module Disabled",
                    `The **${command.module}** module is disabled on this server. Open \`/lumi\` to enable it.`,
                  ),
                ),
              )
              .catch(() => undefined);
            return;
          }
        }

        try {
          await command.execute(interaction, services);
          commandsExecuted.inc({
            command: interaction.commandName,
            module: command.module ?? "builtin",
            status: "ok",
          });
        } catch (err) {
          logger.error(`Command /${interaction.commandName} failed:`, err);
          commandsExecuted.inc({
            command: interaction.commandName,
            module: command.module ?? "builtin",
            status: "error",
          });
          const card = ui.ephemeralCard(
            ui.makeErrorCard(
              "Command Failed",
              "Something went wrong while running that command. Try again in a moment.",
            ),
          );
          if (interaction.deferred || interaction.replied) {
            await interaction.followUp(card).catch(() => undefined);
          } else {
            await interaction.reply(card).catch(() => undefined);
          }
        }
        return;
      }

      if (interaction.isButton()) {
        if (await handlePingButton(interaction, services)) return;
        if (await handlePingClose(interaction)) return;
      }

      if (interaction.isButton() || interaction.isStringSelectMenu()) {
        if (await HubPanel.handleInteraction(interaction, services)) return;
      }

      if (interaction.isButton() || interaction.isStringSelectMenu() || interaction.isModalSubmit()) {
        const panelGuildId = interaction.guildId;
        const managesGuild =
          interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ?? false;
        if (panelGuildId && interaction.customId.startsWith("module_")) {
          if (!managesGuild) {
            await interaction
              .reply(
                ui.ephemeralCard(
                  ui.makeErrorCard(
                    "Missing Permissions",
                    "You need **Manage Server** to manage modules.",
                  ),
                ),
              )
              .catch(() => undefined);
            return;
          }
          const panel = new ModulePanel({ moduleManager, guildId: panelGuildId, interaction });
          if (!interaction.isModalSubmit()) await panel.handleInteraction(interaction);
          return;
        }
        if (panelGuildId && interaction.customId.startsWith("settings_")) {
          if (!managesGuild) {
            await interaction
              .reply(
                ui.ephemeralCard(
                  ui.makeErrorCard(
                    "Missing Permissions",
                    "You need **Manage Server** to edit settings.",
                  ),
                ),
              )
              .catch(() => undefined);
            return;
          }
          const panel = new SettingsPanel({ configService, guildId: panelGuildId, interaction });
          if (interaction.isModalSubmit()) {
            await panel.handleModalSubmit(interaction);
          } else {
            await panel.handleInteraction(interaction);
          }
          return;
        }
      }

      if (interaction.isModalSubmit() || interaction.isButton() || interaction.isStringSelectMenu()) {
        if (!interaction.customId.startsWith("permit_")) return;
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
          await interaction
            .reply(
              ui.ephemeralCard(
                ui.makeErrorCard(
                  "Missing Permissions",
                  "You need **Manage Server** to manage permits.",
                ),
              ),
            )
            .catch(() => undefined);
          return;
        }
        const guildId = interaction.guildId;
        if (!guildId) return;
        const panel = getPanel(guildId, interaction);

        if (interaction.isModalSubmit()) {
          await panel.handleModalSubmit(interaction);
        } else if (interaction.isButton()) {
          await panel.handleInteraction(interaction);
        } else {
          await panel.handleSelectMenu(interaction);
        }
      }
    } catch (err) {
      logger.error("Unhandled interaction error:", err);
    }
  });

  const token = process.env.BOT_TOKEN;
  if (!token) {
    logger.error("BOT_TOKEN is not set");
    process.exit(1);
  }

  await boot({ token, client });

  let shuttingDown = false;
  const shutdownAll = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`Received ${signal}, shutting down...`);

    for (const module of loaded) {
      try {
        await module.definition.onUnload(services);
      } catch (err) {
        logger.error(`Error unloading module ${module.manifest.name}:`, err);
      }
    }

    try {
      metricsServer?.stop();
      await rpc.stop();
      await shutdown(client);
      await invalidation.close();
      await disconnectDatabase();
      await redis.quit();
    } catch (err) {
      logger.error("Error during shutdown:", err);
    }

    process.exit(0);
  };

  process.on("SIGINT", () => void shutdownAll("SIGINT"));
  process.on("SIGTERM", () => void shutdownAll("SIGTERM"));

  console.log("Lumi v2 is ready!");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
