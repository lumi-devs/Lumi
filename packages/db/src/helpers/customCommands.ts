import type { Prisma } from "@prisma/client";
import type { DbContext } from "../context.js";

export interface CustomCommandImportGroup {
  name: string;
  description: string | null;
  position?: number;
}

export interface CustomCommandImportSchedule {
  cron: string | null;
  intervalSeconds: number | null;
  timezone: string;
  nextRunAt: Date;
}

export interface CustomCommandImportCommand {
  name: string;
  description: string | null;
  triggerType: string;
  trigger: string;
  responses: unknown;
  enabled: boolean;
  cooldownSeconds: number;
  permissionNodes: string[];
  groupName: string | null;
  schedule: CustomCommandImportSchedule | null;
}

export interface CustomCommandImportInput {
  guildId: string;
  userId: string;
  overwrite: boolean;
  groups: CustomCommandImportGroup[];
  commands: CustomCommandImportCommand[];
}

export interface CustomCommandImportResult {
  groups: number;
  commands: number;
}

export interface CustomCommandInput {
  name: string;
  description: string | null;
  triggerType: string;
  trigger: string;
  responses: unknown;
  enabled: boolean;
  cooldownSeconds: number;
  permissionNodes: string[];
  groupId: string | null;
}

export interface CustomCommandCreateInput extends CustomCommandInput {
  guildId: string;
  createdBy: string;
}

export type CustomCommandUpdateInput = Partial<CustomCommandInput>;

export function createCustomCommandHelpers(ctx: DbContext) {
  const { prisma } = ctx;

  return {
    findKv: (guildId: string, userId: string, key: string) =>
      prisma.customCommandKv.findUnique({
        where: { guildId_userId_key: { guildId, userId, key } },
      }),
    findKvId: (guildId: string, userId: string, key: string) =>
      prisma.customCommandKv.findUnique({
        where: { guildId_userId_key: { guildId, userId, key } },
        select: { id: true },
      }),
    countKv: (guildId: string, userId: string) =>
      prisma.customCommandKv.count({ where: { guildId, userId } }),
    upsertKv: (
      guildId: string,
      userId: string,
      key: string,
      value: unknown,
      expiresAt: Date | null,
    ) =>
      prisma.customCommandKv.upsert({
        where: { guildId_userId_key: { guildId, userId, key } },
        update: { value: value as Prisma.InputJsonValue, expiresAt },
        create: {
          guildId,
          userId,
          key,
          value: value as Prisma.InputJsonValue,
          expiresAt,
        },
      }),
    deleteKv: (guildId: string, userId: string, key: string) =>
      prisma.customCommandKv.deleteMany({
        where: { guildId, userId, key },
      }),
    listKv: (guildId: string, userId: string, take: number) =>
      prisma.customCommandKv.findMany({
        where: {
          guildId,
          userId,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        orderBy: { updatedAt: "desc" },
        take,
      }),
    clearExpiredKv: (guildId: string) =>
      prisma.customCommandKv.deleteMany({
        where: { guildId, expiresAt: { lte: new Date() } },
      }),

    listCommands: (guildId: string) =>
      prisma.customCommand.findMany({
        where: { guildId },
        include: { group: true, schedule: true },
        orderBy: [{ name: "asc" }],
      }),
    listEnabledCommands: (guildId: string) =>
      prisma.customCommand.findMany({
        where: { guildId, enabled: true },
        include: { group: true, schedule: true },
        orderBy: [{ name: "asc" }],
      }),
    findCommandByName: (guildId: string, name: string) =>
      prisma.customCommand.findUnique({
        where: { guildId_name: { guildId, name } },
        include: { group: true, schedule: true },
      }),
    countCommands: (guildId: string) =>
      prisma.customCommand.count({ where: { guildId } }),
    createCommand: (data: CustomCommandCreateInput) =>
      prisma.customCommand.create({
        data: {
          ...data,
          responses: data.responses as Prisma.InputJsonValue,
        },
        include: { group: true, schedule: true },
      }),
    updateCommand: (id: string, data: CustomCommandUpdateInput) => {
      const { responses, ...rest } = data;
      return prisma.customCommand.update({
        where: { id },
        data: {
          ...rest,
          ...(responses === undefined
            ? {}
            : { responses: responses as Prisma.InputJsonValue }),
        },
        include: { group: true, schedule: true },
      });
    },
    deleteCommand: (id: string) =>
      prisma.customCommand.delete({ where: { id } }),

    listGroups: (guildId: string) =>
      prisma.customCommandGroup.findMany({
        where: { guildId },
        orderBy: [{ position: "asc" }, { name: "asc" }],
      }),
    findGroupByName: (guildId: string, name: string) =>
      prisma.customCommandGroup.findUnique({
        where: { guildId_name: { guildId, name } },
      }),
    countGroups: (guildId: string) =>
      prisma.customCommandGroup.count({ where: { guildId } }),
    createGroup: (data: Prisma.CustomCommandGroupUncheckedCreateInput) =>
      prisma.customCommandGroup.create({ data }),
    updateGroup: (
      id: string,
      data: Prisma.CustomCommandGroupUncheckedUpdateInput,
    ) =>
      prisma.customCommandGroup.update({
        where: { id },
        data,
      }),
    deleteGroup: (id: string) =>
      prisma.customCommandGroup.delete({ where: { id } }),

    listSchedules: (guildId: string) =>
      prisma.customCommandSchedule.findMany({
        where: { command: { guildId } },
        include: { command: true },
        orderBy: { nextRunAt: "asc" },
        take: 50,
      }),
    deleteSchedules: (commandId: string) =>
      prisma.customCommandSchedule.deleteMany({ where: { commandId } }),
    upsertSchedule: (
      commandId: string,
      data: {
        cron: string | null;
        intervalSeconds: number | null;
        timezone: string;
        nextRunAt: Date;
      },
    ) =>
      prisma.customCommandSchedule.upsert({
        where: { commandId },
        update: {
          cron: data.cron,
          intervalSeconds: data.intervalSeconds,
          timezone: data.timezone,
          nextRunAt: data.nextRunAt,
        },
        create: {
          commandId,
          cron: data.cron,
          intervalSeconds: data.intervalSeconds,
          timezone: data.timezone,
          nextRunAt: data.nextRunAt,
        },
      }),
    dueSchedules: (now: Date) =>
      prisma.customCommandSchedule.findMany({
        where: { nextRunAt: { lte: now } },
        include: { command: true },
        orderBy: { nextRunAt: "asc" },
        take: 50,
      }),
    advanceSchedule: (id: string, nextRunAt: Date, lastRunAt: Date) =>
      prisma.customCommandSchedule.update({
        where: { id },
        data: { nextRunAt, lastRunAt },
      }),

    listCommandNames: (guildId: string) =>
      prisma.customCommand.findMany({
        where: { guildId },
        select: { name: true },
      }),
    listGroupNames: (guildId: string) =>
      prisma.customCommandGroup.findMany({
        where: { guildId },
        select: { name: true },
      }),
    listCommandsCreatedBy: (guildId: string, userId: string) =>
      prisma.customCommand.findMany({
        where: { guildId, createdBy: userId },
        include: { group: true, schedule: true },
        orderBy: { name: "asc" },
      }),
    listKvForUser: (guildId: string, userId: string) =>
      prisma.customCommandKv.findMany({
        where: { guildId, userId },
        orderBy: { updatedAt: "desc" },
      }),
    async deleteUserData(guildId: string, userId: string) {
      const [commands, kv] = await prisma.$transaction([
        prisma.customCommand.deleteMany({
          where: { guildId, createdBy: userId },
        }),
        prisma.customCommandKv.deleteMany({ where: { guildId, userId } }),
      ]);
      return { commands: commands.count, kv: kv.count };
    },

    importCommands: (
      input: CustomCommandImportInput,
    ): Promise<CustomCommandImportResult> =>
      prisma.$transaction(async (tx) => {
        const groupIdByName = new Map<string, string>();
        let importedGroups = 0;
        let importedCommands = 0;

        for (const group of input.groups) {
          const existing = await tx.customCommandGroup.findUnique({
            where: {
              guildId_name: { guildId: input.guildId, name: group.name },
            },
          });
          if (existing) {
            groupIdByName.set(group.name, existing.id);
            if (input.overwrite) {
              await tx.customCommandGroup.update({
                where: { id: existing.id },
                data: {
                  description: group.description ?? null,
                  ...(group.position !== undefined
                    ? { position: group.position }
                    : {}),
                },
              });
            }
            continue;
          }
          const created = await tx.customCommandGroup.create({
            data: {
              guildId: input.guildId,
              name: group.name,
              description: group.description ?? null,
              position: group.position ?? 0,
            },
          });
          groupIdByName.set(group.name, created.id);
          importedGroups += 1;
        }

        const existingGroups = await tx.customCommandGroup.findMany({
          where: { guildId: input.guildId },
          select: { id: true, name: true },
        });
        for (const group of existingGroups) {
          groupIdByName.set(group.name, group.id);
        }

        for (const command of input.commands) {
          const groupId = command.groupName
            ? (groupIdByName.get(command.groupName) ?? null)
            : null;
          const existing = await tx.customCommand.findUnique({
            where: {
              guildId_name: {
                guildId: input.guildId,
                name: command.name,
              },
            },
          });

          const dataPayload = {
            description: command.description,
            triggerType: command.triggerType,
            trigger: command.trigger,
            responses: command.responses as Prisma.InputJsonValue,
            enabled: command.enabled,
            cooldownSeconds: command.cooldownSeconds,
            permissionNodes: command.permissionNodes,
            groupId,
          };

          let commandId: string;
          if (existing) {
            await tx.customCommand.update({
              where: { id: existing.id },
              data: dataPayload,
            });
            commandId = existing.id;
          } else {
            const created = await tx.customCommand.create({
              data: {
                guildId: input.guildId,
                name: command.name,
                createdBy: input.userId,
                ...dataPayload,
              },
            });
            commandId = created.id;
            importedCommands += 1;
          }

          if (command.schedule) {
            await tx.customCommandSchedule.upsert({
              where: { commandId },
              update: {
                cron: command.schedule.cron,
                intervalSeconds: command.schedule.intervalSeconds,
                timezone: command.schedule.timezone,
                nextRunAt: command.schedule.nextRunAt,
              },
              create: {
                commandId,
                cron: command.schedule.cron,
                intervalSeconds: command.schedule.intervalSeconds,
                timezone: command.schedule.timezone,
                nextRunAt: command.schedule.nextRunAt,
              },
            });
          } else if (existing) {
            await tx.customCommandSchedule.deleteMany({ where: { commandId } });
          }
        }

        return { groups: importedGroups, commands: importedCommands };
      }),
  };
}
