import type { ModuleServices } from "@lumi/module-kit";
import type { CustomCommandGroupRow, CustomCommandRow } from "./types.js";

const CacheTtlMs = 15_000;

interface CacheEntry {
  expiresAt: number;
  commands: CustomCommandRow[];
}

const cache = new Map<string, CacheEntry>();

function prismaOf(services: ModuleServices): any {
  return services.db?.prisma ?? (services as { prisma?: any }).prisma;
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
  const rows = (await prismaOf(services).customCommand.findMany({
    where: { guildId },
    include: { group: true, schedule: true },
    orderBy: [{ name: "asc" }],
  })) as CustomCommandRow[];
  return rows;
}

export async function listEnabledCommands(
  services: ModuleServices,
  guildId: string,
): Promise<CustomCommandRow[]> {
  const now = Date.now();
  const cached = cache.get(guildId);
  if (cached && cached.expiresAt > now) return cached.commands;

  const rows = (await prismaOf(services).customCommand.findMany({
    where: { guildId, enabled: true },
    include: { group: true, schedule: true },
    orderBy: [{ name: "asc" }],
  })) as CustomCommandRow[];
  cache.set(guildId, { expiresAt: now + CacheTtlMs, commands: rows });
  return rows;
}

export async function getCommandByName(
  services: ModuleServices,
  guildId: string,
  name: string,
): Promise<CustomCommandRow | null> {
  return (await prismaOf(services).customCommand.findUnique({
    where: { guildId_name: { guildId, name } },
    include: { group: true, schedule: true },
  })) as CustomCommandRow | null;
}

export async function getCommandById(
  services: ModuleServices,
  guildId: string,
  id: string,
): Promise<CustomCommandRow | null> {
  return (await prismaOf(services).customCommand.findFirst({
    where: { guildId, id },
    include: { group: true, schedule: true },
  })) as CustomCommandRow | null;
}

export async function countCommands(
  services: ModuleServices,
  guildId: string,
): Promise<number> {
  return prismaOf(services).customCommand.count({ where: { guildId } });
}

export async function listGroups(
  services: ModuleServices,
  guildId: string,
): Promise<CustomCommandGroupRow[]> {
  return (await prismaOf(services).customCommandGroup.findMany({
    where: { guildId },
    orderBy: [{ position: "asc" }, { name: "asc" }],
  })) as CustomCommandGroupRow[];
}

export async function getGroupByName(
  services: ModuleServices,
  guildId: string,
  name: string,
): Promise<CustomCommandGroupRow | null> {
  return (await prismaOf(services).customCommandGroup.findUnique({
    where: { guildId_name: { guildId, name } },
  })) as CustomCommandGroupRow | null;
}

export async function countGroups(
  services: ModuleServices,
  guildId: string,
): Promise<number> {
  return prismaOf(services).customCommandGroup.count({ where: { guildId } });
}
