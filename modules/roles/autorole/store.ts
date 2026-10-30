import type { ModuleServices } from "@lumi/module-kit";
import { addMemberRoles, fetchMember } from "../shared.js";
import { AutoroleModuleName, getAutoroleConfig } from "./config.js";
import {
  choosePendingAssignAt,
  mergePendingRoleIds,
  resolveAssignAt,
  selectRolesToAssign,
} from "./logic.js";

export interface PendingAutorole {
  readonly id: string;
  readonly guildId: string;
  readonly userId: string;
  readonly roleIds: readonly string[];
  readonly assignAt: Date;
}

export interface EnqueueAutoroleInput {
  readonly guildId: string;
  readonly userId: string;
  readonly roleIds: readonly string[];
  readonly delaySeconds: number;
  readonly nowMs?: number;
}

function prismaOf(services: ModuleServices): any {
  return services.db.prisma;
}

export async function enqueueAutorole(
  services: ModuleServices,
  input: EnqueueAutoroleInput,
): Promise<PendingAutorole | null> {
  if (input.roleIds.length === 0) return null;
  const prisma = prismaOf(services);
  const nowMs = input.nowMs ?? Date.now();
  const assignAt = resolveAssignAt(nowMs, input.delaySeconds);
  const existing = await prisma.autorolePending
    .findUnique({
      where: {
        guildId_userId: { guildId: input.guildId, userId: input.userId },
      },
    })
    .catch(() => null);

  if (existing) {
    const roleIds = mergePendingRoleIds(existing.roleIds ?? [], input.roleIds);
    return prisma.autorolePending.update({
      where: { id: existing.id },
      data: {
        roleIds,
        assignAt: choosePendingAssignAt(new Date(existing.assignAt), assignAt),
      },
    });
  }

  return prisma.autorolePending.create({
    data: {
      guildId: input.guildId,
      userId: input.userId,
      roleIds: [...new Set(input.roleIds)],
      assignAt,
    },
  });
}

export async function listPendingAutoroles(
  services: ModuleServices,
  nowMs: number,
  limit = 200,
): Promise<PendingAutorole[]> {
  return prismaOf(services).autorolePending.findMany({
    where: { assignAt: { lte: new Date(nowMs) } },
    orderBy: { assignAt: "asc" },
    take: limit,
  });
}

export async function countPendingAutoroles(
  services: ModuleServices,
  guildId: string,
): Promise<number> {
  return prismaOf(services).autorolePending.count({ where: { guildId } });
}

export async function cancelPendingAutoroles(
  services: ModuleServices,
  guildId: string,
  userId?: string,
): Promise<number> {
  const result = await prismaOf(services).autorolePending.deleteMany({
    where: { guildId, ...(userId ? { userId } : {}) },
  });
  return result.count;
}

export interface ProcessAutoroleOptions {
  readonly guildId?: string;
  readonly userId?: string;
  readonly force?: boolean;
  readonly nowMs?: number;
  readonly limit?: number;
}

export interface ProcessAutoroleResult {
  readonly processed: number;
  readonly failed: number;
}

export async function processPendingAutoroles(
  services: ModuleServices,
  options: ProcessAutoroleOptions = {},
): Promise<ProcessAutoroleResult> {
  const nowMs = options.nowMs ?? Date.now();
  const prisma = prismaOf(services);
  const pending: PendingAutorole[] = await prisma.autorolePending.findMany({
    where: {
      assignAt: { lte: new Date(nowMs) },
      ...(options.guildId ? { guildId: options.guildId } : {}),
      ...(options.userId ? { userId: options.userId } : {}),
    },
    orderBy: { assignAt: "asc" },
    take: options.limit ?? 200,
  });

  let processed = 0;
  let failed = 0;
  for (const row of pending) {
    if (!services.modules.isEnabled(row.guildId, AutoroleModuleName)) {
      continue;
    }

    const guild = services.client.guilds.cache.get(row.guildId);
    if (!guild) {
      await prisma.autorolePending
        .delete({ where: { id: row.id } })
        .catch(() => undefined);
      failed += 1;
      continue;
    }

    const config = await getAutoroleConfig(services, row.guildId);
    if (!config.enabled) {
      continue;
    }
    if (config.paused && options.force !== true) {
      continue;
    }

    const member = await fetchMember(guild, row.userId);
    if (!member) {
      await prisma.autorolePending
        .delete({ where: { id: row.id } })
        .catch(() => undefined);
      failed += 1;
      continue;
    }

    const roleIds = selectRolesToAssign(row.roleIds, [
      ...member.roles.cache.keys(),
    ]);
    if (roleIds.length === 0) {
      await prisma.autorolePending
        .delete({ where: { id: row.id } })
        .catch(() => undefined);
      continue;
    }

    const result = await addMemberRoles(
      services,
      guild,
      member,
      roleIds,
      "Autorole",
    );
    if (result.failed.length === 0) {
      await prisma.autorolePending
        .delete({ where: { id: row.id } })
        .catch(() => undefined);
      processed += 1;
    } else {
      failed += 1;
    }
  }

  return { processed, failed };
}
