import type { ModuleServices } from "@lumi/module-kit";
import { readReminderConfig } from "./config.js";
import { buildRetentionWhere } from "./policy.js";
import { reminderModel } from "./store.js";

export async function cleanupDeliveredReminders(
  services: ModuleServices,
  now = new Date(),
): Promise<number> {
  let removed = 0;

  for (const guild of services.client.guilds.cache.values()) {
    const config = await readReminderConfig(services, guild.id);
    const result = await reminderModel(services).deleteMany({
      where: buildRetentionWhere(now, config.retentionDays, guild.id),
    });
    removed += result.count;
  }

  if (removed > 0) {
    services.observability?.logger?.info?.("reminder retention cleanup", {
      removed,
    });
  }
  return removed;
}
