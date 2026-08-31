import { Listener, Events } from "@sapphire/framework";
import { getUtility } from "#lib/module-system/Utility.js";
import { ApplyOptions } from "@sapphire/decorators";
import type { Client } from "discord.js";
import { logError } from "#lib/utilities/errors.js";
import { isModuleEnabled } from "#lib/utilities/misc.js";
import { mapWithConcurrency } from "#lib/utilities/concurrency.js";
import { tempVcRegistry } from "../registry.js";

/**
 * Reconcile runs against every guild on the shard before it is healthy, so
 * serializing it turned guilds-per-shard directly into startup seconds. Capped
 * rather than unbounded because reconcile hits the Discord API per guild.
 */
const RECONCILE_CONCURRENCY = 10;

@ApplyOptions<Listener.Options>({
  name: "tempvcReady",
  event: Events.ClientReady,
  once: true,
})
export default class TempVcReadyListener extends Listener<
  typeof Events.ClientReady
> {
  public async run(client: Client<true>) {
    const service = getUtility("tempvc");

    tempVcRegistry.wire();

    const guilds = [...client.guilds.cache.values()];
    await mapWithConcurrency(guilds, RECONCILE_CONCURRENCY, async (guild) => {
      if (!(await isModuleEnabled(guild.id, "tempvc"))) return;
      await service
        .reconcileGuild(guild)
        .catch((err: unknown) =>
          logError(`TempVC: reconcile failed for ${guild.id}`, err),
        );
    });
  }
}
