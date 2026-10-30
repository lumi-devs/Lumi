import type { ModuleServices, TaskDefinition } from "@lumi/module-kit";
import type { GuildBasedChannel, User } from "discord.js";
import { getCustomCommandsConfig } from "./config.js";
import { nextRunAt } from "./duration.js";
import { executeCustomCommand } from "./engine.js";
import { ModuleName, type CustomCommandRow, type TriggerType } from "./types.js";

function prismaOf(services: ModuleServices): any {
  return services.db?.prisma ?? (services as { prisma?: any }).prisma;
}

interface DueSchedule {
  id: string;
  commandId: string;
  cron: string | null;
  intervalSeconds: number | null;
  timezone: string | null;
  nextRunAt: Date;
  lastRunAt: Date | null;
  command: CustomCommandRow;
}

export async function runDueSchedules(services: ModuleServices): Promise<void> {
  const now = new Date();
  const due = (await prismaOf(services).customCommandSchedule.findMany({
    where: { nextRunAt: { lte: now } },
    include: { command: true },
    orderBy: { nextRunAt: "asc" },
    take: 50,
  })) as DueSchedule[];

  for (const schedule of due) {
    const current = new Date();
    const next = nextRunAt({
      cron: schedule.cron,
      intervalSeconds: schedule.intervalSeconds,
      timezone: schedule.timezone,
      from: current,
    });
    const nextRun = next ?? new Date(current.getTime() + 24 * 60 * 60 * 1_000);

    await prismaOf(services)
      .customCommandSchedule.update({
        where: { id: schedule.id },
        data: { nextRunAt: nextRun, lastRunAt: current },
      })
      .catch((error: unknown) => {
        services.observability?.logger?.warn?.(
          "[custom-commands] failed to advance schedule",
          { scheduleId: schedule.id, error },
        );
      });

    if (!schedule.command.enabled) continue;
    if (!services.modules.isEnabled(schedule.command.guildId, ModuleName)) {
      continue;
    }

    try {
      await runSchedule(services, schedule, current);
    } catch (error) {
      services.observability?.logger?.warn?.(
        "[custom-commands] scheduled command failed",
        {
          guildId: schedule.command.guildId,
          command: schedule.command.name,
          error: error instanceof Error ? error.message : String(error),
        },
      );
    }
  }
}

async function runSchedule(
  services: ModuleServices,
  schedule: DueSchedule,
  now: Date,
): Promise<void> {
  const config = await getCustomCommandsConfig(
    services,
    schedule.command.guildId,
  );
  if (!config.enabled || !config.scheduleChannelId) {
    services.observability?.logger?.warn?.(
      "[custom-commands] schedule skipped: no scheduleChannelId configured",
      {
        guildId: schedule.command.guildId,
        command: schedule.command.name,
      },
    );
    return;
  }

  const guild =
    services.client.guilds.cache.get(schedule.command.guildId) ??
    (await services.client.guilds.fetch(schedule.command.guildId).catch(() => null));
  if (!guild) return;

  const channel = (await services.client.channels
    .fetch(config.scheduleChannelId)
    .catch(() => null)) as GuildBasedChannel | null;
  if (!channel || !("send" in channel) || !channel.isTextBased()) return;

  const actor =
    (await services.client.users
      .fetch(schedule.command.createdBy)
      .catch(() => null)) ?? (services.client.user as User | null);
  if (!actor) return;

  const member = await guild.members
    .fetch(schedule.command.createdBy)
    .catch(() => null);

  const type: TriggerType = schedule.cron ? "cron" : "interval";
  const value = schedule.cron ?? String(schedule.intervalSeconds ?? "");

  await executeCustomCommand(
    services,
    schedule.command,
    {
      guild,
      actor,
      member,
      channel: channel as GuildBasedChannel,
      args: [],
      trigger: { type, value },
      reply: { kind: "channel", channel },
    },
    config,
  );

  services.observability?.logger?.info?.(
    "[custom-commands] schedule ran",
    {
      guildId: schedule.command.guildId,
      command: schedule.command.name,
      at: now.toISOString(),
    },
  );
}

export const scheduleTask: TaskDefinition = {
  name: "schedules",
  cron: "*/1 * * * *",
  timezone: "UTC",
  handler: runDueSchedules,
};
