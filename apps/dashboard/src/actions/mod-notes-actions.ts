"use server";

import { revalidatePath } from "next/cache";
import { RPC_ACTIONS } from "@lumi/contracts";
import { requireGuild } from "#/lib/auth-guards";
import { rpcCall } from "#/lib/rpc";
import { isRateLimited } from "#/lib/rate-limit";
import { runAction, type ActionResult } from "#/lib/action-result";

async function guardedModNotesAction(guildId: string) {
  const session = await requireGuild(guildId);
  if (await isRateLimited(`guild-action:${session.userId}`, 60, 60_000)) {
    throw new Error("Too many requests — slow down.");
  }
  return session;
}

export async function addModNote(
  guildId: string,
  userId: string,
  message: string,
): Promise<ActionResult> {
  return runAction(async () => {
    const session = await guardedModNotesAction(guildId);
    await rpcCall(RPC_ACTIONS.guildModNotesAdd, {
      guildId,
      actorId: session.userId,
      data: { userId, message },
    });
    revalidatePath(`/guild/${guildId}/mod-notes`);
    return { ok: true };
  });
}

export async function removeModNote(
  guildId: string,
  id: number,
): Promise<ActionResult> {
  return runAction(async () => {
    const session = await guardedModNotesAction(guildId);
    await rpcCall(RPC_ACTIONS.guildModNotesRemove, {
      guildId,
      actorId: session.userId,
      data: { id },
    });
    revalidatePath(`/guild/${guildId}/mod-notes`);
    return { ok: true };
  });
}
