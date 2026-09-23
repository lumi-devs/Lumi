import { Listener, Events } from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import { styleText } from "node:util";
import { Emojis } from "#lib/utilities/assets.js";
import { getShardCount } from "#lib/env.js";

@ApplyOptions<Listener.Options>({ once: true, event: Events.ClientReady })
export class ReadyListener extends Listener<typeof Events.ClientReady> {
  public run() {
    const { client, logger, moduleStore, stores } = this.container;
    const tag = client.user?.tag ?? "Bot";
    const guilds = client.guilds.cache.size;
    const commands = stores.get("commands").size;
    const modules = moduleStore.all().length;
    const memMB = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);

    void client.application?.fetch().catch((err) => {
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

    void this.#publishStats(guilds);
    void this.#reconcileGuilds();
  }

  async #publishStats(guilds: number) {
    const stats = {
      tag: this.container.client.user?.tag,
      guilds,
      uptime: process.uptime(),
      memoryMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      nodeVersion: process.version,
      startedAt: new Date().toISOString(),
    };
    await this.container.db
      .publishBotStats(stats)
      .catch((err) =>
        this.container.logger.warn("[Ready] Bot stats publish failed:", err),
      );
  }

  /**
   * Catches up `Guild.leftAt` for departures/rejoins that happened while
   * every shard covering that guild was offline, so no `guildCreate`/
   * `guildDelete` ever fired for them.
   */
  async #reconcileGuilds(): Promise<void> {
    try {
      const { client, db } = this.container;
      const cachedIds = [...client.guilds.cache.keys()];

      const rejoined = await db.findDepartedGuildIds(cachedIds);
      await Promise.all(rejoined.map((id) => db.markGuildRejoined(id)));

      // `client.shard.ids` is the shard ids ShardingManager assigned to this
      // process; only guilds computed to belong to one of them may be
      // touched here, or two processes could race the same Postgres rows.
      const myShardIds = this.container.client.shard?.ids ?? [0];
      const shardCount = getShardCount();
      const cachedSet = new Set(cachedIds);

      const activeIds = await db.findActiveGuildIds();
      const departed = activeIds.filter((id) => {
        if (cachedSet.has(id)) return false;
        const ownerShard = Number((BigInt(id) >> 22n) % BigInt(shardCount));
        return myShardIds.includes(ownerShard);
      });

      await Promise.all(departed.map((id) => db.markGuildLeft(id)));
    } catch (err) {
      this.container.logger.warn("[Ready] Guild reconcile sweep failed:", err);
    }
  }
}
