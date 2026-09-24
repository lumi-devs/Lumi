"use server";

import { revalidatePath } from "next/cache";
import { rpc } from "#/lib/rpc";
import type { ActionResult } from "#/lib/action-result";
import { guildAction } from "./_guard";

export async function addModNote(
  guildId: string,
  userId: string,
  message: string,
): Promise<ActionResult> {
  return guildAction(guildId, async (session) => {
    await rpc("guild.modNotes.add", {
      guildId,
      actorId: session.userId,
      data: { userId, message },
    });
    revalidatePath(`/guild/${guildId}/moderation/notes`);
    return { ok: true };
  });
}

export async function removeModNote(
  guildId: string,
  id: number,
): Promise<ActionResult> {
  return guildAction(guildId, async (session) => {
    await rpc("guild.modNotes.remove", {
      guildId,
      actorId: session.userId,
      data: { id },
    });
    revalidatePath(`/guild/${guildId}/moderation/notes`);
    return { ok: true };
  });
}
