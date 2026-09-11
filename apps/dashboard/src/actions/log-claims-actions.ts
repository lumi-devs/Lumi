"use server";

import { RpcActions } from "@lumi/contracts";
import { requireGuild } from "#/lib/auth-guards";
import { rpcCall } from "#/lib/rpc";
import { isRateLimited } from "#/lib/rate-limit";
import { runAction, type ActionResult } from "#/lib/action-result";

async function guardedLogClaimAction(guildId: string) {
  const session = await requireGuild(guildId);
  if (await isRateLimited(`guild-action:${session.userId}`, 60, 60_000)) {
    throw new Error("Too many requests — slow down.");
  }
  return session;
}

export async function issueLogClaim(
  guildId: string,
): Promise<ActionResult & { code?: string; expiresIn?: number }> {
  return runAction(async () => {
    const session = await guardedLogClaimAction(guildId);
    const data = await rpcCall(RpcActions.guildLogClaimsIssue, {
      guildId,
      actorId: session.userId,
    });
    return { ok: true, code: data.code, expiresIn: data.expiresIn };
  });
}

/**
 * Checks whether a channel has been claimed since `issuedAt`. Only marks the
 * claim consumed — it does not write config, so the picker just fills in the
 * field and the admin still hits the normal Save bar, same as any other edit.
 * Only one claim code is active per guild at a time, so the newest claim
 * after the code was issued is unambiguously the one it produced.
 */
export async function pollChannelClaim(
  guildId: string,
  issuedAt: string,
): Promise<ActionResult & { channelId?: string }> {
  return runAction(async () => {
    const session = await guardedLogClaimAction(guildId);
    const { claims } = await rpcCall(RpcActions.guildLogClaimsList, {
      guildId,
      actorId: session.userId,
    });
    const claim = claims.find((c) => c.claimedAt > issuedAt);
    if (!claim) return { ok: true };

    await rpcCall(RpcActions.guildLogClaimsDismiss, {
      guildId,
      actorId: session.userId,
      data: { channelId: claim.channelId, outcome: "confirmed" },
    });
    return { ok: true, channelId: claim.channelId };
  });
}
