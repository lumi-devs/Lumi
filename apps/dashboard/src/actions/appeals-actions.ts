"use server";

import { revalidatePath } from "next/cache";
import { type AppealReviewStatus } from "@lumi/contracts/rpc";
import { rpc } from "#/lib/rpc";
import type { ActionResult } from "#/lib/action-result";
import { guildAction } from "./_guard";

export async function reviewAppeal(
  guildId: string,
  id: number,
  status: AppealReviewStatus,
): Promise<ActionResult> {
  return guildAction(guildId, async (session) => {
    await rpc("guild.appeals.review", {
      guildId,
      actorId: session.userId,
      data: { id, status },
    });
    revalidatePath(`/guild/${guildId}/appeals`);
    return { ok: true };
  });
}
