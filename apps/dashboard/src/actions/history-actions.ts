"use server";

import { revalidatePath } from "next/cache";
import { rpc } from "#/lib/rpc";
import type { ActionResult } from "#/lib/action-result";
import { guildAction } from "./_guard";

export async function rollbackConfigChange(
  guildId: string,
  entryId: number,
): Promise<ActionResult> {
  return guildAction(guildId, async (session) => {
    await rpc("guild.history.rollback", {
      guildId,
      actorId: session.userId,
      data: { entryId },
    });
    revalidatePath(`/guild/${guildId}/config/history`);
    revalidatePath(`/guild/${guildId}/config/modules`);
    return { ok: true };
  });
}
