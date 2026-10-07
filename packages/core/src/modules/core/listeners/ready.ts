import { Events } from "discord.js";
import { defineListener } from "#lib/listeners/listener-def.js";
import type { Container } from "#lib/services.js";
import { commandRegistry } from "#lib/commands/command-def.js";
import { styleText } from "node:util";
import { Emojis } from "#lib/utilities/assets.js";
import { getShardCount } from "#lib/env.js";

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

/**
 * Catches up `Guild.leftAt` for departures/rejoins that happened while
 * every shard covering that guild was offline, so no `guildCreate`/
 * `guildDelete` ever fired for them.
 */
async function reconcileGuilds(services: Container): Promise<void> {
  try {
    const { client, db } = services;
    const cachedIds = [...client.guilds.cache.keys()];

    const rejoined = await db.findDepartedGuildIds(cachedIds);
    await Promise.all(rejoined.map((id: string) => db.markGuildRejoined(id)));

    // `client.shard.ids` is the shard ids ShardingManager assigned to this
    // process; only guilds computed to belong to one of them may be
    // touched here, or two processes could race the same Postgres rows.
    const myShardIds = services.client.shard?.ids ?? [0];
    const shardCount = getShardCount();
    const cachedSet = new Set(cachedIds);

    const activeIds = await db.findActiveGuildIds();
    const departed = activeIds.filter((id: string) => {
      if (cachedSet.has(id)) return false;
      const ownerShard = Number((BigInt(id) >> 22n) % BigInt(shardCount));
      return myShardIds.includes(ownerShard);
    });

    await Promise.all(departed.map((id: string) => db.markGuildLeft(id)));
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
      `${styleText(["bold", "green"], ` ${Emojis.Fire} Lumi `)} ${styleText("cyan", tag)} ${bar} ${guilds} guilds`,
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
  },
});
