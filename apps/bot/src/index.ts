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
  const core = await createCoreServices(logger);

  let services: LumiServices | undefined;
  const loader = new ModuleLoader({
    roots: [
      { path: modulesRoot, origin: "bundled" },
      { path: addonsRoot, origin: "addon" },
    ],
    getServices: () => {
      if (!services) throw new Error("services are not initialized");
      return services;
    },
    botVersion: version,
    reservedCommands: builtinCommands.map((command) => command.name),
    async onChange() {
      if (!client.isReady() || !services) return;
      await registerApplicationCommands(client, services);
    },
  });

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

  wireBuiltins(client, services);
  await loader.load();

  const metrics = startMetricsServer(env.metricsPort(), () => client.isReady(), logger);

  const shutdown = async (signal: string): Promise<void> => {
    if (stopping) return;
    stopping = true;
    logger.info({ signal }, "shutting down");
    metrics.stop();
    try {
      await loader.unloadAll();
    } finally {
      await client.destroy().catch(() => undefined);
      await core.shutdown();
    }
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
