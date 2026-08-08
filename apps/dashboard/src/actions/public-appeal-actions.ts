"use server";

import { headers } from "next/headers";
import { RPC_ACTIONS } from "@lumi/contracts";
import { rpcCall } from "#/lib/rpc";
import { isRateLimited } from "#/lib/rate-limit";
import { runAction, type ActionResult } from "#/lib/action-result";

/**
 * Public, unauthenticated submission for the `/appeal/[guildId]/[caseId]`
 * intake page. There is no session to key a rate limit off, so this uses the
 * request's forwarded IP the same way `login/page.tsx` does — and the token
 * itself is re-verified from scratch by the RPC handler, not trusted from
 * whatever the page already showed the visitor.
 */
export async function submitAppeal(
  guildId: string,
  caseId: number,
  token: string,
  message: string,
): Promise<ActionResult> {
  return runAction(async () => {
    const ip = (await headers()).get("x-forwarded-for") ?? "unknown";
    if (await isRateLimited(`appeal-submit:${ip}`, 5, 60 * 60_000)) {
      throw new Error("Too many appeal submissions — try again later.");
    }
    if (await isRateLimited(`appeal-submit:${guildId}:${caseId}`, 3, 60 * 60_000)) {
      throw new Error("Too many appeal submissions — try again later.");
    }

    await rpcCall(RPC_ACTIONS.guildAppealsSubmit, {
      guildId,
      data: { caseId, token, message },
    });
    return { ok: true };
  });
}
