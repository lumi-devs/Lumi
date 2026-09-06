"use server";

import { revalidatePath } from "next/cache";
import { RpcActions } from "@lumi/contracts";
import { requireGuild } from "#/lib/auth-guards";
import { rpcCall } from "#/lib/rpc";
import { isRateLimited } from "#/lib/rate-limit";
import { runAction, type ActionResult } from "#/lib/action-result";

function loggingModulePath(guildId: string): string {
  return `/guild/${guildId}/config/modules/logging`;
}

async function guardedLogClaimAction(guildId: string) {
  const session = await requireGuild(guildId);
  if (await isRateLimited(`guild-action:${session.userId}`, 60, 60_000)) {
    throw new Error("Too many requests — slow down.");
  }
  return session;
}

export async function confirmLogClaim(
  guildId: string,
  channelId: string,
  logTypeKey: string,
): Promise<ActionResult> {
  return runAction(async () => {
    const session = await guardedLogClaimAction(guildId);
    await rpcCall(RpcActions.guildConfigSetMany, {
      guildId,
      actorId: session.userId,
      data: { moduleName: "logging", values: { [logTypeKey]: channelId } },
    });
    await rpcCall(RpcActions.guildLogClaimsDismiss, {
      guildId,
      actorId: session.userId,
      data: { channelId, outcome: "confirmed" },
    });
    revalidatePath(loggingModulePath(guildId));
    return { ok: true };
  });
}

export async function dismissLogClaim(
  guildId: string,
  channelId: string,
): Promise<ActionResult> {
  return runAction(async () => {
    const session = await guardedLogClaimAction(guildId);
    await rpcCall(RpcActions.guildLogClaimsDismiss, {
      guildId,
      actorId: session.userId,
      data: { channelId, outcome: "dismissed" },
    });
    revalidatePath(loggingModulePath(guildId));
    return { ok: true };
  });
}
