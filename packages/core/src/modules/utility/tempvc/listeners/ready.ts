import { Listener, Events } from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import type { Client } from "discord.js";
import { logError } from "#utilities/errors.js";
import { isModuleEnabled } from "#utilities/listeners.js";
import { tempVcRegistry } from "../registry.js";
import type TempVcService from "../services/TempVcService.js";

@ApplyOptions<Listener.Options>({
  name: "tempvcReady",
  event: Events.ClientReady,
  once: true,
})
export default class TempVcReadyListener extends Listener<
  typeof Events.ClientReady
> {
  public async run(client: Client<true>) {
    const service = this.container.stores
      .get("services")
      .get("tempvc") as TempVcService;

    tempVcRegistry.wire();

    for (const guild of client.guilds.cache.values()) {
      if (!(await isModuleEnabled(guild.id, "tempvc"))) continue;
      await service
        .reconcileGuild(guild)
        .catch((err: unknown) =>
          logError(`TempVC: reconcile failed for ${guild.id}`, err),
        );
    }
  }
}
