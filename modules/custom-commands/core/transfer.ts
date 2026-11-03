import type { ModuleServices } from "@lumi/module-kit";
import { z } from "zod";
import {
  isValidTimezone,
  nextRunAt,
  parseDuration,
  validateCronExpression,
} from "./duration.js";
import { parseResponses, ResponsesSchema } from "./responses.js";
import {
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
  type CommandExport,
  type CustomCommandRow,
  Limits,
  type ResponseSpec,
  type TriggerType,
  TriggerTypes,
} from "./types.js";

const ExportGroupSchema = z
  .object({
    name: z.string().min(1).max(Limits.nameMaxLength),
    description: z.string().max(Limits.descriptionMaxLength).optional(),
    position: z.number().int().min(0).max(10_000).optional(),
  })
  .strict();

const ExportScheduleSchema = z
  .object({
    cron: z.string().max(200).optional(),
    intervalSeconds: z.number().int().min(1).max(31_536_000).optional(),
    timezone: z.string().max(64).optional(),
  })
  .strict()
  .refine(
    (value) =>
      (value.cron === undefined) !== (value.intervalSeconds === undefined),
    {
      message:
        "A schedule must contain exactly one of cron or intervalSeconds.",
    },
  );

const PermissionNodeSchema = z.string().min(1).max(100);

const ExportCommandSchema = z
  .object({
    name: z.string().min(1).max(Limits.nameMaxLength),
    description: z.string().max(Limits.descriptionMaxLength).optional(),
    triggerType: z.enum(TriggerTypes),
    trigger: z.string().max(Limits.triggerMaxLength),
    responses: ResponsesSchema,
    enabled: z.boolean().optional(),
    cooldownSeconds: z
      .number()
      .int()
      .min(0)
      .max(Limits.cooldownMaxSeconds)
      .optional(),
    permissionNodes: z.array(PermissionNodeSchema).max(50).optional(),
    group: z.string().min(1).max(Limits.nameMaxLength).optional(),
    schedule: ExportScheduleSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const name = validateCommandName(value.name);
    if (!name.ok) {
      context.addIssue({ code: "custom", message: name.error, path: ["name"] });
    }
    const trigger = validateTrigger(value.triggerType, value.trigger);
    if (!trigger.ok) {
      context.addIssue({
        code: "custom",
        message: trigger.error,
        path: ["trigger"],
      });
    }
    if (value.schedule?.cron) {
      const cron = validateCronExpression(value.schedule.cron);
      if (!cron.ok) {
        context.addIssue({
          code: "custom",
          message: cron.error,
          path: ["schedule", "cron"],
        });
      }
    }
    if (value.schedule?.timezone && !isValidTimezone(value.schedule.timezone)) {
      context.addIssue({
        code: "custom",
        message: "Unknown timezone.",
        path: ["schedule", "timezone"],
      });
    }
  });

export const CommandExportSchema = z
  .object({
    version: z.literal(1),
    exportedAt: z.string().max(64).optional(),
    groups: z.array(ExportGroupSchema).max(Limits.importGroups),
    commands: z.array(ExportCommandSchema).max(Limits.importCommands),
  })
  .strict();

export async function buildExport(
  services: ModuleServices,
  guildId: string,
  name?: string,
): Promise<CommandExport> {
  const commands = await listCommands(services, guildId);
  const selected = name
    ? commands.filter((command) => command.name === normalizeCommandName(name))
    : commands;
  if (name && selected.length === 0) {
    throw new Error(`Command "${name}" was not found.`);
  }

  const groups = await listGroups(services, guildId);
  const groupIds = new Set(
    selected
      .map((command) => command.groupId)
      .filter((id): id is string => Boolean(id)),
  );
  const selectedGroups = name
    ? groups.filter((group) => groupIds.has(group.id))
    : groups;

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    groups: selectedGroups.map((group) => ({
      name: group.name,
      ...(group.description ? { description: group.description } : {}),
      position: group.position,
    })),
    commands: selected.map((command) => commandExport(command, groups)),
  };
}

function commandExport(
  command: CustomCommandRow,
  groups: Array<{ id: string; name: string }>,
): CommandExport["commands"][number] {
  const group = groups.find((entry) => entry.id === command.groupId);
  return {
    name: command.name,
    ...(command.description ? { description: command.description } : {}),
    triggerType: command.triggerType as TriggerType,
    trigger: command.trigger,
    responses: parseResponses(command.responses) as ResponseSpec[],
    enabled: command.enabled,
    cooldownSeconds: command.cooldownSeconds,
    permissionNodes: command.permissionNodes,
    ...(group ? { group: group.name } : {}),
    ...(command.schedule
      ? {
          schedule: {
            ...(command.schedule.cron ? { cron: command.schedule.cron } : {}),
            ...(command.schedule.intervalSeconds !== null
              ? { intervalSeconds: command.schedule.intervalSeconds }
              : {}),
            ...(command.schedule.timezone
              ? { timezone: command.schedule.timezone }
              : {}),
          },
        }
      : {}),
  };
}

export interface ImportResult {
  groups: number;
  commands: number;
}

export async function importCommands(
  services: ModuleServices,
  guildId: string,
  json: string,
  options: { overwrite: boolean; userId: string },
): Promise<ImportResult> {
  const bytes = new TextEncoder().encode(json).byteLength;
  if (bytes > Limits.importBytes) {
    throw new Error(`Import payload exceeds ${Limits.importBytes} bytes.`);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new Error("Import payload is not valid JSON.");
  }

  const parsed = CommandExportSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(
      issue
        ? `${issue.path.join(".") || "import"}: ${issue.message}`
        : "Import payload is invalid.",
    );
  }
  const data = parsed.data;

  const commandNames = new Set<string>();
  for (const command of data.commands) {
    const name = normalizeCommandName(command.name);
    if (commandNames.has(name)) {
      throw new Error(`Duplicate command "${command.name}" in import.`);
    }
    commandNames.add(name);
  }

  const groupNames = new Set<string>();
  for (const group of data.groups) {
    const name = normalizeCommandName(group.name);
    if (groupNames.has(name)) {
      throw new Error(`Duplicate group "${group.name}" in import.`);
    }
    groupNames.add(name);
  }

  const [existingCommands, existingGroups] = await Promise.all([
    services.helpers.customCommands.listCommandNames(guildId),
    services.helpers.customCommands.listGroupNames(guildId),
  ]);
  const existingCommandNames = new Set(existingCommands.map((row) => row.name));
  const existingGroupNames = new Set(existingGroups.map((row) => row.name));

  const newCommands = data.commands.filter(
    (command) => !existingCommandNames.has(normalizeCommandName(command.name)),
  );
  if (existingCommands.length + newCommands.length > Limits.commandsPerGuild) {
    throw new Error(
      `Import would exceed the ${Limits.commandsPerGuild} commands per server limit.`,
    );
  }

  const newGroups = data.groups.filter(
    (group) => !existingGroupNames.has(normalizeCommandName(group.name)),
  );
  if (existingGroups.length + newGroups.length > Limits.groupsPerGuild) {
    throw new Error(
      `Import would exceed the ${Limits.groupsPerGuild} groups per server limit.`,
    );
  }

  if (!options.overwrite) {
    const conflicts = data.commands
      .map((command) => normalizeCommandName(command.name))
      .filter((name) => existingCommandNames.has(name));
    if (conflicts.length > 0) {
      throw new Error(
        `These commands already exist: ${conflicts.join(", ")}. Enable overwrite to replace them.`,
      );
    }
  }

  for (const command of data.commands) {
    if (!command.group) continue;
    const groupName = normalizeCommandName(command.group);
    if (!groupNames.has(groupName) && !existingGroupNames.has(groupName)) {
      throw new Error(
        `Command "${command.name}" references unknown group "${command.group}".`,
      );
    }
  }

  const importGroups = data.groups.map((group) => ({
    name: normalizeCommandName(group.name),
    description: group.description ?? null,
    ...(group.position !== undefined ? { position: group.position } : {}),
  }));

  const importCommands = data.commands.map((command) => {
    const name = normalizeCommandName(command.name);
    const schedule = command.schedule;
    let importSchedule: {
      cron: string | null;
      intervalSeconds: number | null;
      timezone: string;
      nextRunAt: Date;
    } | null = null;
    if (schedule) {
      const timezone = schedule.timezone ?? "UTC";
      const next = nextRunAt({
        cron: schedule.cron ?? null,
        intervalSeconds: schedule.intervalSeconds ?? null,
        timezone,
      });
      if (!next) throw new Error(`Could not compute a schedule for "${name}".`);
      importSchedule = {
        cron: schedule.cron ?? null,
        intervalSeconds: schedule.intervalSeconds ?? null,
        timezone,
        nextRunAt: next,
      };
    }
    return {
      name,
      description: command.description ?? null,
      triggerType: command.triggerType,
      trigger: command.trigger,
      responses: command.responses,
      enabled: command.enabled ?? true,
      cooldownSeconds: command.cooldownSeconds ?? 0,
      permissionNodes: command.permissionNodes ?? [],
      groupName: command.group ? normalizeCommandName(command.group) : null,
      schedule: importSchedule,
    };
  });

  const result = await services.helpers.customCommands.importCommands({
    guildId,
    userId: options.userId,
    overwrite: options.overwrite,
    groups: importGroups,
    commands: importCommands,
  });

  invalidateGuild(guildId);
  return result;
}

export function parseIntervalInput(input: string): number {
  const duration = parseDuration(input);
  if (duration === null) {
    throw new Error("Interval must look like 30s, 5m, 2h or 1d.");
  }
  if (duration < 10) throw new Error("Intervals must be at least 10 seconds.");
  return duration;
}

export async function groupExists(
  services: ModuleServices,
  guildId: string,
  name: string,
): Promise<boolean> {
  return Boolean(
    await getGroupByName(services, guildId, normalizeCommandName(name)),
  );
}
