import { Listener, Events } from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import { bold, green, cyan, gray } from "colorette";
import { Emojis } from "#utilities/assets.js";

@ApplyOptions<Listener.Options>({ once: true, event: Events.ClientReady })
export class ReadyListener extends Listener<typeof Events.ClientReady> {
  public run() {
    const { client, logger, moduleStore, stores } = this.container;
    const tag = client.user?.tag ?? "Bot";
    const guilds = client.guilds.cache.size;
    const commands = stores.get("commands").size;
    const modules = moduleStore.all().length;
    const memMB = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);

    // Natively fetch bot application info once on startup to populate the owner cache
    void client.application?.fetch().catch((err) => {
      logger.error(
        "[ReadyListener] Failed to fetch bot application info:",
        err,
      );
    });

    // ── Terminal Separator Banner (colorette for stdout) ─────────────────
    logger.debug(gray("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
    logger.debug(
      `${bold(green(` ${Emojis.FIRE} Lumi `))} ${cyan(tag)} ${gray("|")} ${guilds} guilds`,
    );
    logger.debug(
      `${gray(" Modules:")}  ${modules} ${gray("|")} Commands: ${commands}`,
    );
    logger.debug(
      `${gray(" Memory: ")}  ${memMB}MB ${gray("|")} PID: ${process.pid}`,
    );
    logger.debug(gray("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));

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
