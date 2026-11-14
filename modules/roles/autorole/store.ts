import type { ModuleServices } from "@lumi/module-kit";
import { addMemberRoles, fetchMember } from "../../shared/roles.js";
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

export async function enqueueAutorole(
  services: ModuleServices,
  input: EnqueueAutoroleInput,
): Promise<PendingAutorole | null> {
  if (input.roleIds.length === 0) return null;
  const nowMs = input.nowMs ?? Date.now();
  const assignAt = resolveAssignAt(nowMs, input.delaySeconds);
  const existing = await services.helpers.roles.autorole.findByUser(
    input.guildId,
    input.userId,
  );

  if (existing) {
    const roleIds = mergePendingRoleIds(existing.roleIds ?? [], input.roleIds);
    return services.helpers.roles.autorole.updatePending(existing.id, {
      roleIds,
      assignAt: choosePendingAssignAt(new Date(existing.assignAt), assignAt),
    });
  }

  return services.helpers.roles.autorole.createPending({
    guildId: input.guildId,
    userId: input.userId,
    roleIds: [...new Set(input.roleIds)],
    assignAt,
  });
}

export async function countPendingAutoroles(
  services: ModuleServices,
  guildId: string,
): Promise<number> {
  return services.helpers.roles.autorole.count(guildId);
}

export async function cancelPendingAutoroles(
  services: ModuleServices,
  guildId: string,
  userId?: string,
): Promise<number> {
  return services.helpers.roles.autorole.cancel(guildId, userId);
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
  const pending: PendingAutorole[] =
    await services.helpers.roles.autorole.listDue(nowMs, options.limit ?? 200, {
      guildId: options.guildId,
      userId: options.userId,
    });

  let processed = 0;
  let failed = 0;
  for (const row of pending) {
    if (!services.modules.isEnabled(row.guildId, AutoroleModuleName)) {
      continue;
    }

    const guild = services.client.guilds.cache.get(row.guildId);
    if (!guild) {
      await services.helpers.roles.autorole.deletePending(row.id);
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
      await services.helpers.roles.autorole.deletePending(row.id);
      failed += 1;
      continue;
    }

    const roleIds = selectRolesToAssign(row.roleIds, [
      ...member.roles.cache.keys(),
    ]);
    if (roleIds.length === 0) {
      await services.helpers.roles.autorole.deletePending(row.id);
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
      await services.helpers.roles.autorole.deletePending(row.id);
      processed += 1;
    } else {
      failed += 1;
    }
  }

  return { processed, failed };
}
