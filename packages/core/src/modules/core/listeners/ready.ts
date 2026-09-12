import { Listener, Events } from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import { styleText } from "node:util";
import { Emojis } from "#lib/utilities/assets.js";

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
}
