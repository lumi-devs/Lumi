import { Listener, Events } from "@sapphire/framework";
import { getService } from "#lib/module-system/Service.js";
import { ApplyOptions } from "@sapphire/decorators";
import type { Client } from "discord.js";
import { logError } from "#lib/utilities/errors.js";
import { isModuleEnabled } from "#lib/utilities/misc.js";
import { tempVcRegistry } from "../registry.js";

@ApplyOptions<Listener.Options>({
  name: "tempvcReady",
  event: Events.ClientReady,
  once: true,
})
export default class TempVcReadyListener extends Listener<
  typeof Events.ClientReady
> {
  public async run(client: Client<true>) {
    const service = getService("tempvc");

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
