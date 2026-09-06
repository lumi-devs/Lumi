"use server";

import { revalidatePath } from "next/cache";
import { RpcActions, type ReactionRoleMenuSetPayload } from "@lumi/contracts";
import { requireGuild } from "#/lib/auth-guards";
import { rpcCall } from "#/lib/rpc";
import { isRateLimited } from "#/lib/rate-limit";
import { runAction, type ActionResult } from "#/lib/action-result";

async function guardedReactionRolesAction(guildId: string) {
  const session = await requireGuild(guildId);
  if (await isRateLimited(`guild-action:${session.userId}`, 60, 60_000)) {
    throw new Error("Too many requests — slow down.");
  }
  return session;
}

export async function setReactionRoleMenu(
  guildId: string,
  menu: ReactionRoleMenuSetPayload,
): Promise<ActionResult> {
  return runAction(async () => {
    const session = await guardedReactionRolesAction(guildId);
    await rpcCall(RpcActions.guildReactionRoleMenuSet, {
      guildId,
      actorId: session.userId,
      data: menu,
    });
    revalidatePath(`/guild/${guildId}/config/roles`);
    return { ok: true };
  });
}

export async function deleteReactionRoleMenu(
  guildId: string,
  id: string,
): Promise<ActionResult> {
  return runAction(async () => {
    const session = await guardedReactionRolesAction(guildId);
    await rpcCall(RpcActions.guildReactionRoleMenuDelete, {
      guildId,
      actorId: session.userId,
      data: { id },
    });
    revalidatePath(`/guild/${guildId}/config/roles`);
    return { ok: true };
  });
}
