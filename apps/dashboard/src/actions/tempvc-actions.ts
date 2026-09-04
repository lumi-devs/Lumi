"use server";

import { revalidatePath } from "next/cache";
import { RPC_ACTIONS } from "@lumi/contracts";
import { requireGuild } from "#/lib/auth-guards";
import { rpcCall } from "#/lib/rpc";
import { isRateLimited } from "#/lib/rate-limit";
import { runAction, type ActionResult } from "#/lib/action-result";

async function guardedTempVcAction(guildId: string) {
  const session = await requireGuild(guildId);
  if (await isRateLimited(`guild-action:${session.userId}`, 60, 60_000)) {
    throw new Error("Too many requests — slow down.");
  }
  return session;
}

export async function setTempVcGenerator(
  guildId: string,
  channelId: string,
  name: string,
  limit = 0,
): Promise<ActionResult> {
  return runAction(async () => {
    const session = await guardedTempVcAction(guildId);
    await rpcCall(RPC_ACTIONS.guildTempVcGeneratorSet, {
      guildId,
      actorId: session.userId,
      data: { channelId, name, limit },
    });
    revalidatePath(`/guild/${guildId}/config/voice`);
    return { ok: true };
  });
}

export async function deleteTempVcGenerator(
  guildId: string,
  channelId: string,
): Promise<ActionResult> {
  return runAction(async () => {
    const session = await guardedTempVcAction(guildId);
    await rpcCall(RPC_ACTIONS.guildTempVcGeneratorSet, {
      guildId,
      actorId: session.userId,
      data: { channelId, name: null },
    });
    revalidatePath(`/guild/${guildId}/config/voice`);
    return { ok: true };
  });
}
