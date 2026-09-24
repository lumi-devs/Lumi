"use server";

import { revalidatePath } from "next/cache";
import { rpc } from "#/lib/rpc";
import type { ActionResult } from "#/lib/action-result";
import { guildAction } from "./_guard";

export async function setTempVcGenerator(
  guildId: string,
  channelId: string,
  name: string,
  limit = 0,
): Promise<ActionResult> {
  return guildAction(guildId, async (session) => {
    await rpc("guild.tempvc.generators.set", {
      guildId,
      actorId: session.userId,
      data: { channelId, name, limit },
    });
    revalidatePath(`/guild/${guildId}/config/voice`);
    return { ok: true };
  });
}

export async function deleteTempVcGenerator(
  guildId: string,
  channelId: string,
): Promise<ActionResult> {
  return guildAction(guildId, async (session) => {
    await rpc("guild.tempvc.generators.set", {
      guildId,
      actorId: session.userId,
      data: { channelId, name: null },
    });
    revalidatePath(`/guild/${guildId}/config/voice`);
    return { ok: true };
  });
}
