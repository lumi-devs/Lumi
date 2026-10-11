import { Events } from "discord.js";
import { defineListener } from "#src/lib/listeners/ListenerDef.js";
import { getUtility } from "#src/lib/module-system/Utility.js";
import type { Client } from "discord.js";
import { logError } from "#src/lib/utilities/Errors.js";
import type { Container } from "#src/lib/Services.js";
import { mapWithConcurrency } from "#src/lib/utilities/Concurrency.js";
import { tempVcRegistry } from "#src/modules/tempvc/data/Registry.js";

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
      if (!(await services.db.modules.isModuleEnabled(guild.id, "tempvc"))) return;
      await service
        .reconcileGuild(services, guild)
        .catch((err: unknown) =>
          logError(`TempVC: reconcile failed for ${guild.id}`, err),
        );
    });
  },
});

export default tempvcReady;
