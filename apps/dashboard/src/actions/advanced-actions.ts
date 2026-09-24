"use server";

import { revalidatePath } from "next/cache";
import { rpc } from "#/lib/rpc";
import type { ActionResult } from "#/lib/action-result";
import { guildAction } from "./_guard";

/** `channelId: null` ignores the whole guild rather than a single channel. */
export async function addIgnoredChannel(
  guildId: string,
  channelId: string | null,
): Promise<ActionResult> {
  return guildAction(guildId, async (session) => {
    await rpc("guild.ignored.add", {
      guildId,
      actorId: session.userId,
      data: { channelId },
    });
    revalidatePath(`/guild/${guildId}/config/advanced`);
    return { ok: true };
  });
}

export async function removeIgnoredChannel(
  guildId: string,
  channelId: string | null,
): Promise<ActionResult> {
  return guildAction(guildId, async (session) => {
    await rpc("guild.ignored.remove", {
      guildId,
      actorId: session.userId,
      data: { channelId },
    });
    revalidatePath(`/guild/${guildId}/config/advanced`);
    return { ok: true };
  });
}
