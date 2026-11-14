import type { ModuleServices } from "@lumi/module-kit";
import type { CustomCommandGroupRow, CustomCommandRow } from "./types.js";

const CacheTtlMs = 15_000;

interface CacheEntry {
  expiresAt: number;
  commands: CustomCommandRow[];
}

const cache = new Map<string, CacheEntry>();

type CustomCommandsHelper = ModuleServices["helpers"]["customCommands"];
export type CommandCreateInput = Parameters<
  CustomCommandsHelper["createCommand"]
>[0];
export type CommandUpdateInput = Parameters<
  CustomCommandsHelper["updateCommand"]
>[1];
type CommandRowRecord = Omit<CustomCommandRow, "permissionNodes"> & {
  permissionNodes: unknown;
};

function permissionNodesOf(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((node): node is string => typeof node === "string");
}

function toCommandRow(record: CommandRowRecord): CustomCommandRow {
  return {
    ...record,
    permissionNodes: permissionNodesOf(record.permissionNodes),
  };
}

export function invalidateGuild(guildId: string): void {
  cache.delete(guildId);
}

export function invalidateAll(): void {
  cache.clear();
}

export async function listCommands(
  services: ModuleServices,
  guildId: string,
): Promise<CustomCommandRow[]> {
  const rows = await services.helpers.customCommands.listCommands(guildId);
  return rows.map(toCommandRow);
}

export async function listEnabledCommands(
  services: ModuleServices,
  guildId: string,
): Promise<CustomCommandRow[]> {
  const now = Date.now();
  const cached = cache.get(guildId);
  if (cached && cached.expiresAt > now) return cached.commands;

  const rows = (
    await services.helpers.customCommands.listEnabledCommands(guildId)
  ).map(toCommandRow);
  cache.set(guildId, { expiresAt: now + CacheTtlMs, commands: rows });
  return rows;
}

export async function getCommandByName(
  services: ModuleServices,
  guildId: string,
  name: string,
): Promise<CustomCommandRow | null> {
  const row = await services.helpers.customCommands.findCommandByName(
    guildId,
    name,
  );
  return row ? toCommandRow(row) : null;
}

export async function createCommand(
  services: ModuleServices,
  data: CommandCreateInput,
): Promise<CustomCommandRow> {
  const row = await services.helpers.customCommands.createCommand(data);
  return toCommandRow(row);
}

export async function updateCommand(
  services: ModuleServices,
  id: string,
  data: CommandUpdateInput,
): Promise<CustomCommandRow> {
  const row = await services.helpers.customCommands.updateCommand(id, data);
  return toCommandRow(row);
}

export async function countCommands(
  services: ModuleServices,
  guildId: string,
): Promise<number> {
  return services.helpers.customCommands.countCommands(guildId);
}

export async function listGroups(
  services: ModuleServices,
  guildId: string,
): Promise<CustomCommandGroupRow[]> {
  return services.helpers.customCommands.listGroups(guildId);
}

export async function getGroupByName(
  services: ModuleServices,
  guildId: string,
  name: string,
): Promise<CustomCommandGroupRow | null> {
  return services.helpers.customCommands.findGroupByName(guildId, name);
}

export async function countGroups(
  services: ModuleServices,
  guildId: string,
): Promise<number> {
  return services.helpers.customCommands.countGroups(guildId);
}
