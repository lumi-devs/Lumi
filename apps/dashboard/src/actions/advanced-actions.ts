"use server";

import { revalidatePath } from "next/cache";
import { RpcActions } from "@lumi/contracts";
import { requireGuild } from "#/lib/auth-guards";
import { rpcCall } from "#/lib/rpc";
import { isRateLimited } from "#/lib/rate-limit";
import { runAction, type ActionResult } from "#/lib/action-result";

async function guardedAdvancedAction(guildId: string) {
  const session = await requireGuild(guildId);
  if (await isRateLimited(`guild-action:${session.userId}`, 60, 60_000)) {
    throw new Error("Too many requests — slow down.");
  }
  return session;
}

/** `channelId: null` ignores the whole guild rather than a single channel. */
export async function addIgnoredChannel(
  guildId: string,
  channelId: string | null,
): Promise<ActionResult> {
  return runAction(async () => {
    const session = await guardedAdvancedAction(guildId);
    await rpcCall(RpcActions.guildIgnoredAdd, {
      guildId,
      actorId: session.userId,
      data: { channelId },
    });
    revalidatePath(`/guild/${guildId}/config/advanced`);
    return { ok: true };
  });
}

export async function removeIgnoredChannel(
  guildId: string,
  channelId: string | null,
): Promise<ActionResult> {
  return runAction(async () => {
    const session = await guardedAdvancedAction(guildId);
    await rpcCall(RpcActions.guildIgnoredRemove, {
      guildId,
      actorId: session.userId,
      data: { channelId },
    });
    revalidatePath(`/guild/${guildId}/config/advanced`);
    return { ok: true };
  });
}
