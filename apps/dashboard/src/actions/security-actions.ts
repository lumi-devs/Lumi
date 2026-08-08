"use server";

import { revalidatePath } from "next/cache";
import { RPC_ACTIONS } from "@lumi/contracts";
import { requireGuild } from "#/lib/auth-guards";
import { rpcCall } from "#/lib/rpc";
import { isRateLimited } from "#/lib/rate-limit";
import { runAction, type ActionResult } from "#/lib/action-result";

async function guardedSecurityAction(guildId: string) {
  const session = await requireGuild(guildId);
  if (await isRateLimited(`guild-action:${session.userId}`, 60, 60_000)) {
    throw new Error("Too many requests — slow down.");
  }
  return session;
}

export async function setPanicMode(
  guildId: string,
  active: boolean,
  channelIds?: string[],
): Promise<ActionResult> {
  return runAction(async () => {
    const session = await guardedSecurityAction(guildId);
    await rpcCall(RPC_ACTIONS.guildPanicSet, {
      guildId,
      actorId: session.userId,
      data: { active, channelIds },
      // Locking every channel outruns the default 8s RPC deadline on a large guild.
      timeoutMs: 120_000,
    });
    revalidatePath(`/guild/${guildId}/security`);
    return { ok: true };
  });
}

export async function setVerificationPanel(
  guildId: string,
  channelId: string,
  messageId: string,
): Promise<ActionResult> {
  return runAction(async () => {
    const session = await guardedSecurityAction(guildId);
    await rpcCall(RPC_ACTIONS.guildVerificationPanelSet, {
      guildId,
      actorId: session.userId,
      data: { channelId, messageId },
    });
    revalidatePath(`/guild/${guildId}/security`);
    return { ok: true };
  });
}

export async function deleteVerificationPanel(
  guildId: string,
): Promise<ActionResult> {
  return runAction(async () => {
    const session = await guardedSecurityAction(guildId);
    await rpcCall(RPC_ACTIONS.guildVerificationPanelDelete, {
      guildId,
      actorId: session.userId,
    });
    revalidatePath(`/guild/${guildId}/security`);
    return { ok: true };
  });
}
