import { Events } from "discord.js";
import { defineListener } from "#lib/listeners/listener-def.js";
import { getUtility } from "#lib/module-system/Utility.js";
import type { Client } from "discord.js";
import { logError } from "#lib/utilities/errors.js";
import type { Container } from "#lib/services.js";
import { isModuleEnabled } from "#lib/utilities/misc.js";
import { mapWithConcurrency } from "#lib/utilities/concurrency.js";
import { tempVcRegistry } from "@lumi/application/services/tempvc/registry.js";

/**
 * Reconcile runs against every guild on the shard before it is healthy, so
 * serializing it turned guilds-per-shard directly into startup seconds. Capped
 * rather than unbounded because reconcile hits the Discord API per guild.
 */
const ReconcileConcurrency = 10;

const tempvcReady = defineListener({
  name: "tempvcReady",
  event: Events.ClientReady,
  once: true,
  async execute(services: Container, client: Client<true>) {
    const service = getUtility("tempvc");

    tempVcRegistry.wire();

    const guilds = [...client.guilds.cache.values()];
    await mapWithConcurrency(guilds, ReconcileConcurrency, async (guild) => {
      if (!(await isModuleEnabled(services, guild.id, "tempvc"))) return;
      await service
        .reconcileGuild(services, guild)
        .catch((err: unknown) =>
          logError(`TempVC: reconcile failed for ${guild.id}`, err),
        );
    });
  },
});

export default tempvcReady;
