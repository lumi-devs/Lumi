import type { ModuleServices } from "@lumi/module-kit";
import type { CustomCommandGroupRow, CustomCommandRow } from "./types.js";

const CacheTtlMs = 15_000;

interface CacheEntry {
  expiresAt: number;
  commands: CustomCommandRow[];
}

const cache = new Map<string, CacheEntry>();

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
  const rows = (await services.helpers.customCommands.listCommands(
    guildId,
  )) as CustomCommandRow[];
  return rows;
}

export async function listEnabledCommands(
  services: ModuleServices,
  guildId: string,
): Promise<CustomCommandRow[]> {
  const now = Date.now();
  const cached = cache.get(guildId);
  if (cached && cached.expiresAt > now) return cached.commands;

  const rows = (await services.helpers.customCommands.listEnabledCommands(
    guildId,
  )) as CustomCommandRow[];
  cache.set(guildId, { expiresAt: now + CacheTtlMs, commands: rows });
  return rows;
}

export async function getCommandByName(
  services: ModuleServices,
  guildId: string,
  name: string,
): Promise<CustomCommandRow | null> {
  return (await services.helpers.customCommands.findCommandByName(
    guildId,
    name,
  )) as CustomCommandRow | null;
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
  return (await services.helpers.customCommands.listGroups(
    guildId,
  )) as CustomCommandGroupRow[];
}

export async function getGroupByName(
  services: ModuleServices,
  guildId: string,
  name: string,
): Promise<CustomCommandGroupRow | null> {
  return (await services.helpers.customCommands.findGroupByName(
    guildId,
    name,
  )) as CustomCommandGroupRow | null;
}

export async function countGroups(
  services: ModuleServices,
  guildId: string,
): Promise<number> {
  return services.helpers.customCommands.countGroups(guildId);
}
