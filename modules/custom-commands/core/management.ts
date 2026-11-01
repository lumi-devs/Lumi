import type { ModuleServices } from "@lumi/module-kit";
import {
  ephemeralCard,
  formatPageFooter,
  makeEmptyCard,
  makeErrorCard,
  makeInfoCard,
  makeListCard,
  makeSuccessCard,
  makeWarningCard,
  type CardReply,
} from "@lumi/ui";
import {
  isValidTimezone,
  nextRunAt,
  validateCronExpression,
} from "./duration.js";
import { validateTemplate } from "./interpreter/index.js";
import { parseResponseInput, parseResponses } from "./responses.js";
import {
  countCommands,
  countGroups,
  getCommandByName,
  getGroupByName,
  invalidateGuild,
  listCommands,
  listGroups,
} from "./store.js";
import {
  normalizeCommandName,
  validateCommandName,
  validateTrigger,
} from "./trigger.js";
import {
  Limits,
  ScheduleTriggerTypes,
  TriggerTypes,
  type CustomCommandRow,
  type TriggerType,
} from "./types.js";
import { parseIntervalInput } from "./transfer.js";

function prismaOf(services: ModuleServices): any {
  return services.db?.prisma ?? (services as { prisma?: any }).prisma;
}

function parsePermissionNodes(input: string | null | undefined): string[] {
  if (!input) return [];
  const nodes = input
    .split(",")
    .map((node) => node.trim())
    .filter((node) => node.length > 0);
  const unique = [...new Set(nodes)];
  for (const node of unique) {
    if (node.length > 100 || !/^[A-Za-z0-9_.*-]+$/.test(node)) {
      throw new Error(`Invalid permission node "${node}".`);
    }
  }
  return unique;
}

function triggerTypeOf(value: string): TriggerType {
  if (!(TriggerTypes as readonly string[]).includes(value)) {
    throw new Error(`Unknown trigger type "${value}".`);
  }
  return value as TriggerType;
}

function summaryLines(command: CustomCommandRow): string[] {
  return [
    `**ID**\n${command.id}`,
    `**Trigger**\n${command.triggerType}: ${command.trigger || "(schedule only)"}`,
    `**Group**\n${command.group?.name ?? "None"}`,
    `**Cooldown**\n${command.cooldownSeconds}s`,
    `**Permissions**\n${command.permissionNodes.length > 0 ? command.permissionNodes.join(", ") : "Everyone"}`,
    `**Status**\n${command.enabled ? "Enabled" : "Disabled"}`,
    `**Responses**\n${command.responses && Array.isArray(command.responses) ? command.responses.length : 0}`,
  ];
}

export interface CreateCommandOptions {
  name: string;
  triggerType: string;
  trigger?: string | null;
  response?: string | null;
  description?: string | null;
  group?: string | null;
  cooldown?: number | null;
  permissions?: string | null;
  enabled?: boolean | null;
}

export async function createCustomCommand(
  services: ModuleServices,
  guildId: string,
  userId: string,
  options: CreateCommandOptions,
): Promise<CardReply> {
  const name = normalizeCommandName(options.name);
  const nameCheck = validateCommandName(name);
  if (!nameCheck.ok) throw new Error(nameCheck.error);

  const triggerType = triggerTypeOf(options.triggerType);
  const trigger = (options.trigger ?? "").trim();
  const triggerCheck = validateTrigger(triggerType, trigger);
  if (!triggerCheck.ok) throw new Error(triggerCheck.error);

  const responses = parseResponseInput(
    options.response && options.response.trim().length > 0
      ? options.response
      : "Command received.",
  );

  const total = await countCommands(services, guildId);
  if (total >= Limits.commandsPerGuild) {
    throw new Error(
      `This server already has the maximum of ${Limits.commandsPerGuild} custom commands.`,
    );
  }

  let groupId: string | null = null;
  if (options.group && options.group.trim().length > 0) {
    const groupName = normalizeCommandName(options.group);
    const group = await getGroupByName(services, guildId, groupName);
    if (!group) throw new Error(`Group "${options.group}" does not exist.`);
    groupId = group.id;
  }

  const cooldown = Math.max(0, Math.floor(options.cooldown ?? 0));
  if (cooldown > Limits.cooldownMaxSeconds) {
    throw new Error(
      `Cooldowns cannot exceed ${Limits.cooldownMaxSeconds} seconds.`,
    );
  }

  const existing = await getCommandByName(services, guildId, name);
  if (existing) throw new Error(`Command "${name}" already exists.`);

  const row = (await prismaOf(services).customCommand.create({
    data: {
      guildId,
      name,
      description: options.description?.trim() || null,
      triggerType,
      trigger,
      responses,
      enabled: options.enabled ?? true,
      cooldownSeconds: cooldown,
      permissionNodes: parsePermissionNodes(options.permissions),
      groupId,
      createdBy: userId,
    },
    include: { group: true, schedule: true },
  })) as CustomCommandRow;

  invalidateGuild(guildId);
  return makeSuccessCard(
    "Custom Command Created",
    [`**Name**\n${row.name}`, ...summaryLines(row)],
    { subtitle: "Manage it with /customcommand edit" },
  );
}

export interface EditCommandOptions {
  name: string;
  triggerType?: string | null;
  trigger?: string | null;
  response?: string | null;
  description?: string | null;
  group?: string | null;
  cooldown?: number | null;
  permissions?: string | null;
  enabled?: boolean | null;
}

export async function editCustomCommand(
  services: ModuleServices,
  guildId: string,
  options: EditCommandOptions,
): Promise<CardReply> {
  const name = normalizeCommandName(options.name);
  const command = await getCommandByName(services, guildId, name);
  if (!command) throw new Error(`Command "${name}" was not found.`);

  const data: Record<string, unknown> = {};

  if (options.triggerType !== undefined && options.triggerType !== null) {
    const type = triggerTypeOf(options.triggerType);
    const trigger =
      options.trigger !== undefined && options.trigger !== null
        ? options.trigger.trim()
        : command.trigger;
    const check = validateTrigger(type, trigger);
    if (!check.ok) throw new Error(check.error);
    data.triggerType = type;
    data.trigger = trigger;
  } else if (options.trigger !== undefined && options.trigger !== null) {
    const check = validateTrigger(
      command.triggerType as TriggerType,
      options.trigger.trim(),
    );
    if (!check.ok) throw new Error(check.error);
    data.trigger = options.trigger.trim();
  }

  if (options.response !== undefined && options.response !== null) {
    data.responses = parseResponseInput(options.response);
  }
  if (options.description !== undefined) {
    data.description = options.description?.trim() || null;
  }
  if (options.group !== undefined && options.group !== null) {
    const value = options.group.trim();
    if (value.length === 0 || value.toLowerCase() === "none") {
      data.groupId = null;
    } else {
      const group = await getGroupByName(
        services,
        guildId,
        normalizeCommandName(value),
      );
      if (!group) throw new Error(`Group "${value}" does not exist.`);
      data.groupId = group.id;
    }
  }
  if (options.cooldown !== undefined && options.cooldown !== null) {
    const cooldown = Math.max(0, Math.floor(options.cooldown));
    if (cooldown > Limits.cooldownMaxSeconds) {
      throw new Error(
        `Cooldowns cannot exceed ${Limits.cooldownMaxSeconds} seconds.`,
      );
    }
    data.cooldownSeconds = cooldown;
  }
  if (options.permissions !== undefined && options.permissions !== null) {
    data.permissionNodes = parsePermissionNodes(options.permissions);
  }
  if (options.enabled !== undefined && options.enabled !== null) {
    data.enabled = options.enabled;
  }

  if (Object.keys(data).length === 0) {
    throw new Error("Provide at least one field to edit.");
  }

  const updated = (await prismaOf(services).customCommand.update({
    where: { id: command.id },
    data,
    include: { group: true, schedule: true },
  })) as CustomCommandRow;

  invalidateGuild(guildId);
  return makeSuccessCard("Custom Command Updated", [
    `**Name**\n${updated.name}`,
    ...summaryLines(updated),
  ]);
}

export async function deleteCustomCommand(
  services: ModuleServices,
  guildId: string,
  name: string,
): Promise<CardReply> {
  const normalized = normalizeCommandName(name);
  const command = await getCommandByName(services, guildId, normalized);
  if (!command) throw new Error(`Command "${normalized}" was not found.`);

  await prismaOf(services).customCommand.delete({ where: { id: command.id } });
  invalidateGuild(guildId);
  return makeSuccessCard(
    "Custom Command Deleted",
    `Deleted **${command.name}** and its schedule.`,
  );
}

export async function listCustomCommands(
  services: ModuleServices,
  guildId: string,
  page: number,
): Promise<CardReply> {
  const commands = await listCommands(services, guildId);
  if (commands.length === 0) {
    return makeEmptyCard(
      "No custom commands",
      "This server has no custom commands yet.",
      "/customcommand create",
    );
  }

  const perPage = 25;
  const totalPages = Math.max(1, Math.ceil(commands.length / perPage));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const start = (currentPage - 1) * perPage;
  const slice = commands.slice(start, start + perPage);
  const items = slice.map((command) => {
    const group = command.group ? ` [${command.group.name}]` : "";
    const status = command.enabled ? "" : " (disabled)";
    const schedule = command.schedule ? " + schedule" : "";
    return `**${command.name}**${group} — ${command.triggerType}:${command.trigger || "scheduled"}${schedule}${status}`;
  });

  return makeListCard(`Custom Commands (${commands.length})`, items, {
    subtitle: `Page ${currentPage} of ${totalPages}`,
    footer: formatPageFooter(currentPage - 1, totalPages),
  });
}

export async function showCustomCommand(
  services: ModuleServices,
  guildId: string,
  name: string,
): Promise<CardReply> {
  const command = await getCommandByName(
    services,
    guildId,
    normalizeCommandName(name),
  );
  if (!command) throw new Error(`Command "${name}" was not found.`);

  let responsePreview: string;
  try {
    responsePreview = JSON.stringify(
      parseResponses(command.responses),
      null,
      2,
    );
  } catch {
    responsePreview = "Invalid response JSON";
  }
  if (responsePreview.length > 1_800) {
    responsePreview = `${responsePreview.slice(0, 1_797)}...`;
  }

  const schedule = command.schedule
    ? [
        `**Schedule**\n${command.schedule.cron ? `cron ${command.schedule.cron}` : `every ${command.schedule.intervalSeconds}s`}`,
        `**Timezone**\n${command.schedule.timezone ?? "UTC"}`,
        `**Next run**\n${command.schedule.nextRunAt.toISOString()}`,
        `**Last run**\n${command.schedule.lastRunAt?.toISOString() ?? "Never"}`,
      ]
    : ["**Schedule**\nNone"];

  return makeInfoCard(command.name, [
    command.description ?? "No description.",
    ...summaryLines(command),
    ...schedule,
    `**Responses**\n\`\`\`json\n${responsePreview}\n\`\`\``,
  ]);
}

export type GroupAction = "create" | "delete" | "rename" | "list";

export async function manageGroup(
  services: ModuleServices,
  guildId: string,
  action: GroupAction,
  name?: string | null,
  newName?: string | null,
  description?: string | null,
): Promise<CardReply> {
  if (action === "list") {
    const groups = await listGroups(services, guildId);
    if (groups.length === 0) {
      return makeEmptyCard(
        "No command groups",
        "This server has no custom command groups.",
        "/customcommand group action:create",
      );
    }
    return makeListCard(
      `Command Groups (${groups.length})`,
      groups.map(
        (group) =>
          `**${group.name}**${group.description ? ` — ${group.description}` : ""}`,
      ),
    );
  }

  if (!name || name.trim().length === 0) {
    throw new Error("Group name is required.");
  }

  if (action === "create") {
    const normalized = normalizeCommandName(name);
    const check = validateCommandName(normalized);
    if (!check.ok) throw new Error(check.error);
    if (await getGroupByName(services, guildId, normalized)) {
      throw new Error(`Group "${normalized}" already exists.`);
    }
    const count = await countGroups(services, guildId);
    if (count >= Limits.groupsPerGuild) {
      throw new Error(
        `This server already has the maximum of ${Limits.groupsPerGuild} groups.`,
      );
    }
    const group = await prismaOf(services).customCommandGroup.create({
      data: {
        guildId,
        name: normalized,
        description: description?.trim() || null,
        position: count,
      },
    });
    invalidateGuild(guildId);
    return makeSuccessCard("Group Created", `Created group **${group.name}**.`);
  }

  const normalized = normalizeCommandName(name);
  const group = await getGroupByName(services, guildId, normalized);
  if (!group) throw new Error(`Group "${normalized}" was not found.`);

  if (action === "delete") {
    await prismaOf(services).customCommandGroup.delete({
      where: { id: group.id },
    });
    invalidateGuild(guildId);
    return makeSuccessCard(
      "Group Deleted",
      `Deleted group **${group.name}**. Its commands are now ungrouped.`,
    );
  }

  if (!newName || newName.trim().length === 0) {
    throw new Error("A new group name is required.");
  }
  const renamed = normalizeCommandName(newName);
  const check = validateCommandName(renamed);
  if (!check.ok) throw new Error(check.error);
  const conflict = await getGroupByName(services, guildId, renamed);
  if (conflict && conflict.id !== group.id) {
    throw new Error(`Group "${renamed}" already exists.`);
  }
  const updated = await prismaOf(services).customCommandGroup.update({
    where: { id: group.id },
    data: {
      name: renamed,
      ...(description !== undefined && description !== null
        ? { description: description.trim() || null }
        : {}),
    },
  });
  invalidateGuild(guildId);
  return makeSuccessCard(
    "Group Renamed",
    `Renamed **${group.name}** to **${updated.name}**.`,
  );
}

export type ScheduleAction = "set" | "clear" | "list";

export async function manageSchedule(
  services: ModuleServices,
  guildId: string,
  action: ScheduleAction,
  name?: string | null,
  cron?: string | null,
  interval?: string | null,
  timezone?: string | null,
): Promise<CardReply> {
  if (action === "list") {
    const rows = (await prismaOf(services).customCommandSchedule.findMany({
      where: { command: { guildId } },
      include: { command: true },
      orderBy: { nextRunAt: "asc" },
      take: 50,
    })) as Array<{
      cron: string | null;
      intervalSeconds: number | null;
      timezone: string | null;
      nextRunAt: Date;
      lastRunAt: Date | null;
      command: { name: string };
    }>;
    if (rows.length === 0) {
      return makeEmptyCard(
        "No schedules",
        "No custom commands have a schedule.",
        "/customcommand schedule action:set",
      );
    }
    return makeListCard(
      "Custom Command Schedules",
      rows.map((row) => {
        const cadence = row.cron
          ? `cron ${row.cron}`
          : `every ${row.intervalSeconds}s`;
        return `**${row.command.name}** — ${cadence} · next ${row.nextRunAt.toISOString()} · last ${row.lastRunAt?.toISOString() ?? "never"}`;
      }),
    );
  }

  if (!name || name.trim().length === 0) {
    throw new Error("Command name is required.");
  }
  const command = await getCommandByName(
    services,
    guildId,
    normalizeCommandName(name),
  );
  if (!command) throw new Error(`Command "${name}" was not found.`);

  if (action === "clear") {
    await prismaOf(services).customCommandSchedule.deleteMany({
      where: { commandId: command.id },
    });
    invalidateGuild(guildId);
    return makeSuccessCard(
      "Schedule Cleared",
      `Removed the schedule from **${command.name}**.`,
    );
  }

  const hasCron = Boolean(cron && cron.trim().length > 0);
  const hasInterval = Boolean(interval && interval.trim().length > 0);
  if (hasCron === hasInterval) {
    throw new Error("Provide exactly one of cron or interval.");
  }

  let cronValue: string | null = null;
  let intervalSeconds: number | null = null;
  if (hasCron) {
    cronValue = cron!.trim();
    const check = validateCronExpression(cronValue);
    if (!check.ok) throw new Error(check.error);
  } else {
    intervalSeconds = parseIntervalInput(interval!);
  }

  const zone = timezone?.trim() || "UTC";
  if (!isValidTimezone(zone)) throw new Error(`Unknown timezone "${zone}".`);

  const next = nextRunAt({
    cron: cronValue,
    intervalSeconds,
    timezone: zone,
  });
  if (!next) throw new Error("Could not compute the next run time.");

  await prismaOf(services).customCommandSchedule.upsert({
    where: { commandId: command.id },
    update: {
      cron: cronValue,
      intervalSeconds,
      timezone: zone,
      nextRunAt: next,
    },
    create: {
      commandId: command.id,
      cron: cronValue,
      intervalSeconds,
      timezone: zone,
      nextRunAt: next,
    },
  });

  invalidateGuild(guildId);
  return makeSuccessCard("Schedule Saved", [
    `**Command**\n${command.name}`,
    `**Cadence**\n${cronValue ? `cron ${cronValue}` : `every ${intervalSeconds}s`}`,
    `**Timezone**\n${zone}`,
    `**Next run**\n${next.toISOString()}`,
    `**Channel**\nSet via the module setting \`scheduleChannelId\`.`,
  ]);
}

export async function diagnoseCommands(
  services: ModuleServices,
  guildId: string,
  name?: string | null,
): Promise<CardReply> {
  const all = await listCommands(services, guildId);
  const commands = name
    ? all.filter((command) => command.name === normalizeCommandName(name))
    : all;
  if (name && commands.length === 0) {
    throw new Error(`Command "${name}" was not found.`);
  }
  if (commands.length === 0) {
    return makeEmptyCard(
      "Nothing to diagnose",
      "This server has no custom commands.",
      "/customcommand create",
    );
  }

  const issues: string[] = [];
  const triggerCounts = new Map<string, number>();
  for (const command of all) {
    const key = `${command.triggerType}:${command.trigger.toLowerCase()}`;
    triggerCounts.set(key, (triggerCounts.get(key) ?? 0) + 1);
  }

  for (const command of commands) {
    if (!(TriggerTypes as readonly string[]).includes(command.triggerType)) {
      issues.push(
        `**${command.name}** — unknown trigger type "${command.triggerType}".`,
      );
      continue;
    }
    const type = command.triggerType as TriggerType;
    const trigger = validateTrigger(type, command.trigger);
    if (!trigger.ok) {
      issues.push(`**${command.name}** — ${trigger.error}`);
    }

    if (
      !name &&
      (triggerCounts.get(
        `${command.triggerType}:${command.trigger.toLowerCase()}`,
      ) ?? 0) > 1
    ) {
      issues.push(
        `**${command.name}** — duplicate ${command.triggerType} trigger "${command.trigger}".`,
      );
    }

    try {
      const responses = parseResponses(command.responses);
      for (const [index, response] of responses.entries()) {
        const templates =
          typeof response === "string"
            ? [response]
            : [
                ...(response.title ? [response.title] : []),
                ...(Array.isArray(response.body)
                  ? response.body
                  : [response.body]),
              ];
        for (const template of templates) {
          const check = validateTemplate(template);
          if (!check.ok) {
            issues.push(
              `**${command.name}** — response ${index + 1}: ${check.error}`,
            );
          }
        }
      }
    } catch (error) {
      issues.push(
        `**${command.name}** — invalid responses: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const needsSchedule = (ScheduleTriggerTypes as readonly string[]).includes(
      type,
    );
    if (needsSchedule && !command.schedule) {
      issues.push(`**${command.name}** — ${type} trigger has no schedule.`);
    }
    if (command.schedule?.cron) {
      const cron = validateCronExpression(command.schedule.cron);
      if (!cron.ok) {
        issues.push(`**${command.name}** — ${cron.error}`);
      }
    }
    if (
      command.schedule?.timezone &&
      !isValidTimezone(command.schedule.timezone)
    ) {
      issues.push(
        `**${command.name}** — unknown timezone "${command.schedule.timezone}".`,
      );
    }
  }

  if (issues.length === 0) {
    return makeSuccessCard(
      "Diagnostics Passed",
      `Checked ${commands.length} custom command(s) with no issues.`,
    );
  }

  return makeWarningCard("Diagnostics Found Issues", issues, {
    subtitle: `${issues.length} issue(s)`,
  });
}

export function errorCard(error: unknown): CardReply {
  return ephemeralCard(
    makeErrorCard(
      "Custom Command Error",
      error instanceof Error ? error.message : String(error),
    ),
  );
}
