"use server";

import { revalidatePath } from "next/cache";
import { RpcActions, type ConfigOverrideModelType } from "@lumi/contracts";
import { requireGuild } from "#/lib/auth-guards";
import { rpcCall } from "#/lib/rpc";
import { isRateLimited } from "#/lib/rate-limit";
import { runAction, type ActionResult } from "#/lib/action-result";

async function guardedOverrideAction(guildId: string) {
  const session = await requireGuild(guildId);
  if (await isRateLimited(`guild-action:${session.userId}`, 60, 60_000)) {
    throw new Error("Too many requests — slow down.");
  }
  return session;
}

export async function setConfigOverride(
  guildId: string,
  moduleName: string,
  key: string,
  modelType: ConfigOverrideModelType,
  modelId: string,
  value: unknown,
): Promise<ActionResult> {
  return runAction(async () => {
    const session = await guardedOverrideAction(guildId);
    await rpcCall(RpcActions.guildOverridesSet, {
      guildId,
      actorId: session.userId,
      data: { moduleName, key, modelType, modelId, value },
    });
    revalidatePath(`/guild/${guildId}/security/overrides`);
    return { ok: true };
  });
}

export async function deleteConfigOverride(
  guildId: string,
  moduleName: string,
  key: string,
  modelType: ConfigOverrideModelType,
  modelId: string,
): Promise<ActionResult> {
  return runAction(async () => {
    const session = await guardedOverrideAction(guildId);
    await rpcCall(RpcActions.guildOverridesSet, {
      guildId,
      actorId: session.userId,
      data: { moduleName, key, modelType, modelId, value: null },
    });
    revalidatePath(`/guild/${guildId}/security/overrides`);
    return { ok: true };
  });
}
