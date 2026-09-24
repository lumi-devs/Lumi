"use server";

import { revalidatePath } from "next/cache";
import { type ConfigOverrideModelType } from "@lumi/contracts/rpc";
import { rpc } from "#/lib/rpc";
import type { ActionResult } from "#/lib/action-result";
import { guildAction } from "./_guard";

export async function setConfigOverride(
  guildId: string,
  moduleName: string,
  key: string,
  modelType: ConfigOverrideModelType,
  modelId: string,
  value: unknown,
): Promise<ActionResult> {
  return guildAction(guildId, async (session) => {
    await rpc("guild.overrides.set", {
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
  return guildAction(guildId, async (session) => {
    await rpc("guild.overrides.set", {
      guildId,
      actorId: session.userId,
      data: { moduleName, key, modelType, modelId, value: null },
    });
    revalidatePath(`/guild/${guildId}/security/overrides`);
    return { ok: true };
  });
}
