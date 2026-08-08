"use server";

import { RPC_ACTIONS } from "@lumi/contracts";
import { requireSession } from "#/lib/auth-guards";
import { rpcCall } from "#/lib/rpc";
import { isRateLimited } from "#/lib/rate-limit";
import { runAction, type ActionResult } from "#/lib/action-result";

/**
 * Completes "web" mode verification for `/verify/[guildId]`. Deliberately
 * uses `requireSession` rather than `requireGuild` — the visitor doesn't
 * need manage-guild access, just their own Discord session, which the RPC
 * handler uses as the actor to grant the verified role to (never trusted
 * from anything else the page sends).
 */
export async function completeWebVerification(
  guildId: string,
): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requireSession();
    if (await isRateLimited(`verify-web:${session.userId}`, 10, 60_000)) {
      throw new Error("Too many attempts — slow down.");
    }
    await rpcCall(RPC_ACTIONS.guildVerificationWebComplete, {
      guildId,
      actorId: session.userId,
    });
    return { ok: true };
  });
}
