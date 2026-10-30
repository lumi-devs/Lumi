import type { ModuleServices } from "@lumi/module-kit";
import { cardCreateOptions } from "@lumi/ui";
import { nextCronOccurrence } from "./cron.js";
import { ModuleName, readReminderConfig } from "./config.js";
import type { ReminderConfig } from "./config.js";
import {
  claimReminder,
  findDueReminders,
  markDelivered,
  markRetry,
  reclaimStaleClaims,
} from "./store.js";
import type { ReminderRecord } from "./store.js";
import { reminderDeliveryCard } from "./ui.js";

async function sendDirect(
  services: ModuleServices,
  reminder: ReminderRecord,
): Promise<boolean> {
  try {
    const user = await services.client.users.fetch(reminder.userId);
    await user.send(cardCreateOptions(reminderDeliveryCard(reminder, false)));
    return true;
  } catch (error) {
    services.observability?.logger?.debug?.("reminder DM failed", {
      guildId: reminder.guildId,
      userId: reminder.userId,
      reminderId: reminder.id,
      error,
    });
    return false;
  }
}

async function sendToChannel(
  services: ModuleServices,
  reminder: ReminderRecord,
  channelId: string,
): Promise<boolean> {
  try {
    const channel = await services.client.channels
      .fetch(channelId)
      .catch(() => null);
    if (!channel?.isTextBased() || !("send" in channel)) return false;
    await channel.send(cardCreateOptions(reminderDeliveryCard(reminder, true)));
    return true;
  } catch (error) {
    services.observability?.logger?.debug?.(
      "reminder channel delivery failed",
      {
        guildId: reminder.guildId,
        channelId,
        reminderId: reminder.id,
        error,
      },
    );
    return false;
  }
}

async function deliverFallback(
  services: ModuleServices,
  reminder: ReminderRecord,
  config: ReminderConfig,
): Promise<boolean> {
  if (!config.dmFallback) return false;

  const candidates = [reminder.channelId, config.fallbackChannelId].filter(
    (channelId): channelId is string =>
      typeof channelId === "string" && channelId.length > 0,
  );
  const seen = new Set<string>();
  for (const channelId of candidates) {
    if (seen.has(channelId)) continue;
    seen.add(channelId);
    if (await sendToChannel(services, reminder, channelId)) return true;
  }
  return false;
}

async function deliverReminder(
  services: ModuleServices,
  reminder: ReminderRecord,
  config: ReminderConfig,
  now: Date,
): Promise<boolean> {
  const delivered = (await sendDirect(services, reminder))
    ? true
    : await deliverFallback(services, reminder, config);

  if (delivered) {
    const next =
      reminder.recurringCron === null
        ? undefined
        : nextCronOccurrence(reminder.recurringCron, now);
    await markDelivered(services, reminder, now, next);
    return true;
  }

  const retry = await markRetry(services, reminder, now);
  services.observability?.logger?.warn?.("reminder delivery failed", {
    guildId: reminder.guildId,
    userId: reminder.userId,
    reminderId: reminder.id,
    attempt: retry.attempt,
    final: retry.failed,
  });
  return false;
}

export async function deliverDueReminders(
  services: ModuleServices,
  now = new Date(),
): Promise<{ processed: number; delivered: number; deferred: number }> {
  await reclaimStaleClaims(services, now);

  const due = await findDueReminders(services, now, 100);
  const configs = new Map<string, ReminderConfig | null>();
  let delivered = 0;
  let processed = 0;

  for (const reminder of due) {
    if (!services.modules.isEnabled(reminder.guildId, ModuleName)) continue;

    let config = configs.get(reminder.guildId);
    if (config === undefined) {
      config = await readReminderConfig(services, reminder.guildId);
      configs.set(reminder.guildId, config);
    }
    if (!config?.enabled) continue;

    if (!(await claimReminder(services, reminder))) continue;
    processed += 1;
    if (await deliverReminder(services, reminder, config, now)) delivered += 1;
  }

  return { processed, delivered, deferred: processed - delivered };
}
