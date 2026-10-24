import { Client, GatewayIntentBits } from "discord.js";
import type { LumiServices } from "@lumi/module-kit";
import { createLogger, env } from "@lumi/foundation";
import { startMetricsServer } from "@lumi/observability";
import { AddonInstaller } from "@lumi/downloader";
import { ModuleLoader } from "@lumi/module-runtime";
import { builtinCommands, registerApplicationCommands, wireBuiltins } from "./runtime/app.ts";
import { addonsRoot, modulesRoot, repoRoot, version } from "./runtime/paths.ts";
import { composeServices, createCoreServices } from "./runtime/services.ts";

const logger = createLogger({ name: "lumi", level: env.logLevel() });

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

let stopping = false;

async function main(): Promise<void> {
  // Start core services (Redis, DB) and module loader in parallel
  const [core, loader] = await Promise.all([
    createCoreServices(logger),
    (async () => {
      const l = new ModuleLoader({
        roots: [
          { path: modulesRoot, origin: "bundled" },
          { path: addonsRoot, origin: "addon" },
        ],
        botVersion: version,
        reservedCommands: builtinCommands.map((command) => command.name),
        async onChange() {
          if (!client.isReady() || !services) return;
          await registerApplicationCommands(client, services);
        },
      });
      return l;
    })(),
  ]);

  let services: LumiServices | undefined;

  // Set up getServices callback now that loader is created
  (loader as ModuleLoader & { setGetServices?: (fn: () => LumiServices) => void }).setGetServices?.(
    () => {
      if (!services) throw new Error("services are not initialized");
      return services;
    },
  );

  const installer = new AddonInstaller({
    root: repoRoot,
    store: core.db.downloader,
    redis: core.redis,
    logger,
    async onInstalled(name) {
      if (loader.get(name)) await loader.reload(name);
      else await loader.load();
    },
    async onRemoved(name) {
      await loader.unload(name);
    },
  });

  services = composeServices(core, client, logger, loader, installer);

  // Parallelize: wire built-ins, load modules, start metrics
  await Promise.all([
    wireBuiltins(client, services),
    loader.load(),
    (async () => {
      const metrics = startMetricsServer(env.metricsPort(), () => client.isReady(), logger);
      return metrics;
    })(),
  ]);

  const shutdown = async (signal: string): Promise<void> => {
    if (stopping) return;
    stopping = true;
    logger.info({ signal }, "shutting down");
    // Stop metrics, unload modules, destroy client in parallel
    await Promise.allSettled([
      loader.unloadAll(),
      client.destroy().catch(() => undefined),
      core.shutdown(),
    ]);
  };

  const onSignal = (signal: string): void => {
    void shutdown(signal)
      .then(() => process.exit(0))
      .catch((error: unknown) => {
        logger.error({ error, signal }, "shutdown failed");
        process.exit(1);
      });
  };

  process.on("SIGINT", () => onSignal("SIGINT"));
  process.on("SIGTERM", () => onSignal("SIGTERM"));

  await client.login(env.botToken());
  logger.info({ version }, "lumi online");
}

main().catch((error: unknown) => {
  logger.fatal({ error }, "boot failed");
  process.exit(1);
});