"use server";

import { revalidatePath } from "next/cache";
import { RPC_ACTIONS } from "@lumi/contracts";
import { requireGuild } from "#/lib/auth-guards";
import { rpcCall } from "#/lib/rpc";
import { isRateLimited } from "#/lib/rate-limit";
import { runAction, type ActionResult } from "#/lib/action-result";

async function guardedHistoryAction(guildId: string) {
  const session = await requireGuild(guildId);
  if (await isRateLimited(`guild-action:${session.userId}`, 60, 60_000)) {
    throw new Error("Too many requests — slow down.");
  }
  return session;
}

export async function rollbackConfigChange(
  guildId: string,
  entryId: string,
): Promise<ActionResult> {
  return runAction(async () => {
    const session = await guardedHistoryAction(guildId);
    await rpcCall(RPC_ACTIONS.guildHistoryRollback, {
      guildId,
      actorId: session.userId,
      data: { entryId },
    });
    revalidatePath(`/guild/${guildId}/history`);
    revalidatePath(`/guild/${guildId}/modules`);
    return { ok: true };
  });
}
