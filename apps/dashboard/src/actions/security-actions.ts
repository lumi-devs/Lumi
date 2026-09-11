"use server";

import { revalidatePath } from "next/cache";
import { RpcActions, type VerificationPanelSetResult } from "@lumi/contracts";
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
    await rpcCall(RpcActions.guildPanicSet, {
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

/**
 * Posts (or edits in place) the verification panel message. `channelId`
 * targets an existing channel; `createChannel` has the bot create a fresh
 * one instead. `deleteOldMessage` only matters when the target differs from
 * the currently tracked channel — it deletes the message left behind there.
 */
export async function postVerificationPanel(
  guildId: string,
  input: {
    channelId?: string;
    createChannel?: boolean;
    deleteOldMessage?: boolean;
  },
): Promise<ActionResult & Partial<VerificationPanelSetResult>> {
  return runAction(async () => {
    const session = await guardedSecurityAction(guildId);
    const result = await rpcCall(RpcActions.guildVerificationPanelSet, {
      guildId,
      actorId: session.userId,
      data: input,
    });
    revalidatePath(`/guild/${guildId}/security`);
    return { ok: true, ...result };
  });
}

export async function deleteVerificationPanel(
  guildId: string,
): Promise<ActionResult> {
  return runAction(async () => {
    const session = await guardedSecurityAction(guildId);
    await rpcCall(RpcActions.guildVerificationPanelDelete, {
      guildId,
      actorId: session.userId,
    });
    revalidatePath(`/guild/${guildId}/security`);
    return { ok: true };
  });
}

export async function restoreGuildBackup(
  guildId: string,
  backupId?: number,
): Promise<ActionResult> {
  return runAction(async () => {
    const session = await guardedSecurityAction(guildId);
    await rpcCall(RpcActions.guildBackupRestore, {
      guildId,
      actorId: session.userId,
      data: { backupId },
      // Recreating roles/channels on a large guild outruns the default deadline.
      timeoutMs: 120_000,
    });
    revalidatePath(`/guild/${guildId}/security`);
    return { ok: true };
  });
}
