"use server";

import { headers } from "next/headers";
import { RpcActions } from "@lumi/contracts";
import { rpcCall } from "#/lib/rpc";
import { isRateLimited } from "#/lib/rate-limit";
import { getClientIp } from "#/lib/client-ip";
import { runAction, type ActionResult } from "#/lib/action-result";

/**
 * Public, unauthenticated submission for the `/appeal/[guildId]/[caseId]`
 * intake page. There is no session to key a rate limit off, so this uses the
 * proxy-attested client IP the same way `login/page.tsx` does (see
 * lib/client-ip.ts — the raw X-Forwarded-For is client-writable and would let
 * a submitter mint a fresh bucket per request) — and the token itself is
 * re-verified from scratch by the RPC handler, not trusted from whatever the
 * page already showed the visitor.
 */
export async function submitAppeal(
  guildId: string,
  caseId: number,
  token: string,
  message: string,
): Promise<ActionResult> {
  return runAction(async () => {
    const ip = getClientIp(await headers());
    if (await isRateLimited(`appeal-submit:${ip}`, 5, 60 * 60_000)) {
      throw new Error("Too many appeal submissions — try again later.");
    }
    if (await isRateLimited(`appeal-submit:${guildId}:${caseId}`, 3, 60 * 60_000)) {
      throw new Error("Too many appeal submissions — try again later.");
    }

    await rpcCall(RpcActions.guildAppealsSubmit, {
      guildId,
      data: { caseId, token, message },
    });
    return { ok: true };
  });
}
