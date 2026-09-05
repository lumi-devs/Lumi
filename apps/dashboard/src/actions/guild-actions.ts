"use server";

import { revalidatePath } from "next/cache";
import {
  RpcActions,
  type GuildSettingsPayload,
  type GuildSetupRunResult,
  type PermitKind,
  type PermitTargetType,
} from "@lumi/contracts";
import { requireGuild } from "#/lib/auth-guards";
import { rpcCall } from "#/lib/rpc";
import { isRateLimited } from "#/lib/rate-limit";
import { runAction, type ActionResult } from "#/lib/action-result";

async function guardedAction(guildId: string) {
  const session = await requireGuild(guildId);
  if (await isRateLimited(`guild-action:${session.userId}`, 60, 60_000)) {
    throw new Error("Too many requests — slow down.");
  }
  return session;
}

export type { ActionResult };

export async function toggleGuildModule(
  guildId: string,
  moduleName: string,
  enabled: boolean,
): Promise<ActionResult> {
  return runAction(async () => {
    const session = await guardedAction(guildId);
    await rpcCall(RpcActions.guildModuleToggle, {
      guildId,
      actorId: session.userId,
      data: { moduleName, enabled },
    });
    revalidatePath(`/guild/${guildId}`);
    return { ok: true };
  });
}

export async function setGuildConfigField(
  guildId: string,
  moduleName: string,
  key: string,
  value: unknown,
): Promise<ActionResult> {
  return runAction(async () => {
    const session = await guardedAction(guildId);
    await rpcCall(RpcActions.guildConfigSet, {
      guildId,
      actorId: session.userId,
      data: { moduleName, key, value },
    });
    revalidatePath(`/guild/${guildId}/config/modules/${moduleName}`);
    return { ok: true };
  });
}

export async function runGuildSetup(
  guildId: string,
): Promise<ActionResult & { result?: GuildSetupRunResult }> {
  return runAction(async () => {
    const session = await guardedAction(guildId);
    const result = (await rpcCall(RpcActions.guildSetupRun, {
      guildId,
      actorId: session.userId,
    })) as GuildSetupRunResult;
    revalidatePath(`/guild/${guildId}`);
    revalidatePath(`/guild/${guildId}/config/modules/security`);
    revalidatePath(`/guild/${guildId}/config/modules/mod`);
    revalidatePath(`/guild/${guildId}/setup`);
    return { ok: true, result };
  });
}

export async function setGuildSettings(
  guildId: string,
  data: GuildSettingsPayload,
): Promise<ActionResult> {
  return runAction(async () => {
    const session = await guardedAction(guildId);
    await rpcCall(RpcActions.guildSettingsSet, {
      guildId,
      actorId: session.userId,
      data,
    });
    revalidatePath(`/guild/${guildId}`);
    return { ok: true };
  });
}

export async function createPermit(
  guildId: string,
  name: string,
  kind: PermitKind,
  nodes: string[],
): Promise<ActionResult & { permitId?: number }> {
  return runAction(async () => {
    const session = await guardedAction(guildId);
    const res = (await rpcCall(RpcActions.guildPermitsCreate, {
      guildId,
      actorId: session.userId,
      data: { name, kind, nodes },
    })) as { permit: { id: number } };
    revalidatePath(`/guild/${guildId}/permits`);
    return { ok: true, permitId: res.permit.id };
  });
}

export async function updatePermit(
  guildId: string,
  permitId: number,
  data: { name?: string; nodes?: string[] },
): Promise<ActionResult> {
  return runAction(async () => {
    const session = await guardedAction(guildId);
    await rpcCall(RpcActions.guildPermitsUpdate, {
      guildId,
      actorId: session.userId,
      data: { permitId, ...data },
    });
    revalidatePath(`/guild/${guildId}/permits`);
    return { ok: true };
  });
}

export async function deletePermit(
  guildId: string,
  permitId: number,
): Promise<ActionResult> {
  return runAction(async () => {
    const session = await guardedAction(guildId);
    await rpcCall(RpcActions.guildPermitsDelete, {
      guildId,
      actorId: session.userId,
      data: { permitId },
    });
    revalidatePath(`/guild/${guildId}/permits`);
    return { ok: true };
  });
}

export async function assignPermit(
  guildId: string,
  permitId: number,
  targetType: PermitTargetType,
  targetId: string,
): Promise<ActionResult> {
  return runAction(async () => {
    const session = await guardedAction(guildId);
    await rpcCall(RpcActions.guildPermitsAssign, {
      guildId,
      actorId: session.userId,
      data: { permitId, targetType, targetId },
    });
    revalidatePath(`/guild/${guildId}/permits`);
    return { ok: true };
  });
}

export async function unassignPermit(
  guildId: string,
  permitId: number,
  targetType: PermitTargetType,
  targetId: string,
): Promise<ActionResult> {
  return runAction(async () => {
    const session = await guardedAction(guildId);
    await rpcCall(RpcActions.guildPermitsUnassign, {
      guildId,
      actorId: session.userId,
      data: { permitId, targetType, targetId },
    });
    revalidatePath(`/guild/${guildId}/permits`);
    return { ok: true };
  });
}

