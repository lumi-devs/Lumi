import { Events } from "discord.js";
import { defineListener } from "#src/lib/listeners/ListenerDef.js";
import type { Container } from "#src/lib/Services.js";
import { commandRegistry } from "#src/lib/commands/CommandDef.js";
import { styleText } from "node:util";
import { isPrimaryShard } from "#src/lib/Env.js";
import { getUtility } from "#src/lib/module-system/Utility.js";

async function publishStats(services: Container, guilds: number) {
  const stats = {
    tag: services.client.user?.tag,
    guilds,
    uptime: process.uptime(),
    memoryMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    nodeVersion: process.version,
    startedAt: new Date().toISOString(),
  };
  await services.db
    .publishBotStats(stats)
    .catch((err: unknown) =>
      services.logger.warn("[Ready] Bot stats publish failed:", err),
    );
}

async function reconcileGuilds(services: Container): Promise<void> {
  try {
    const { client, db } = services;
    const cachedIds = [...client.guilds.cache.keys()];
    await db.ensureGuilds(cachedIds);
  } catch (err: unknown) {
    services.logger.warn("[Ready] Guild reconcile sweep failed:", err);
  }
}

export const readyListener = defineListener({
  name: "readyListener",
  event: Events.ClientReady,
  once: true,
  execute(services: Container) {
    const { client, logger, moduleStore } = services;
    const tag = client.user?.tag ?? "Bot";
    const guilds = client.guilds.cache.size;
    const commands = commandRegistry.size;
    const modules = moduleStore.all().length;
    const memMB = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);

    void client.application?.fetch().catch((err: unknown) => {
      logger.error(
        "[ReadyListener] Failed to fetch bot application info:",
        err,
      );
    });

    const rule = styleText("gray", "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    const bar = styleText("gray", "|");
    logger.debug(rule);
    logger.debug(
      `${styleText(["bold", "green"], ` 🔥 Lumi `)} ${styleText("cyan", tag)} ${bar} ${guilds} guilds`,
    );
    logger.debug(
      `${styleText("gray", " Modules:")}  ${modules} ${bar} Commands: ${commands}`,
    );
    logger.debug(
      `${styleText("gray", " Memory: ")}  ${memMB}MB ${bar} PID: ${process.pid}`,
    );
    logger.debug(rule);

    void publishStats(services, guilds);
    void reconcileGuilds(services);

    if (isPrimaryShard()) {
      void (async () => {
        try {
          const downloader = getUtility<any>("downloader");
          await downloader?.syncApplicationCommands(services);
        } catch (err: unknown) {
          logger.error("[ReadyListener] Failed to sync application commands:", err);
        }
      })();
    }
  },
});
