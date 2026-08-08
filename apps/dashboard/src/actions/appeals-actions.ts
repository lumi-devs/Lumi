"use server";

import { revalidatePath } from "next/cache";
import { RPC_ACTIONS, type AppealReviewStatus } from "@lumi/contracts";
import { requireGuild } from "#/lib/auth-guards";
import { rpcCall } from "#/lib/rpc";
import { isRateLimited } from "#/lib/rate-limit";
import { runAction, type ActionResult } from "#/lib/action-result";

export async function reviewAppeal(
  guildId: string,
  id: number,
  status: AppealReviewStatus,
): Promise<ActionResult> {
  return runAction(async () => {
    const session = await requireGuild(guildId);
    if (await isRateLimited(`guild-action:${session.userId}`, 60, 60_000)) {
      throw new Error("Too many requests — slow down.");
    }
    await rpcCall(RPC_ACTIONS.guildAppealsReview, {
      guildId,
      actorId: session.userId,
      data: { id, status },
    });
    revalidatePath(`/guild/${guildId}/appeals`);
    return { ok: true };
  });
}
