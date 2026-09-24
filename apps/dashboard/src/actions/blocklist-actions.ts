"use server";

import { revalidatePath } from "next/cache";
import { rpc } from "#/lib/rpc";
import type { ActionResult } from "#/lib/action-result";
import { guildAction, ownerAction } from "./_guard";

// Guild-scoped rows need Manage Server on that guild; global rows (`guildId IS
// NULL`) are bot-owner only. Each entry point picks its guard explicitly.

export async function blockUserInGuild(
  guildId: string,
  userId: string,
  reason?: string,
): Promise<ActionResult> {
  return guildAction(guildId, async (session) => {
    await rpc("guild.blocklist.add", {
      guildId,
      actorId: session.userId,
      data: { userId, reason },
    });
    revalidatePath(`/guild/${guildId}/moderation/blocklist`);
    return { ok: true };
  });
}

export async function unblockUserInGuild(
  guildId: string,
  userId: string,
): Promise<ActionResult> {
  return guildAction(guildId, async (session) => {
    await rpc("guild.blocklist.remove", {
      guildId,
      actorId: session.userId,
      data: { userId },
    });
    revalidatePath(`/guild/${guildId}/moderation/blocklist`);
    return { ok: true };
  });
}

export async function blockUserGlobally(
  userId: string,
  reason?: string,
): Promise<ActionResult> {
  return ownerAction(async (session) => {
    await rpc("system.blocklist.add", {
      actorId: session.userId,
      data: { userId, reason },
    });
    revalidatePath("/system/blocklist");
    return { ok: true };
  });
}

export async function unblockUserGlobally(
  userId: string,
): Promise<ActionResult> {
  return ownerAction(async (session) => {
    await rpc("system.blocklist.remove", {
      actorId: session.userId,
      data: { userId },
    });
    revalidatePath("/system/blocklist");
    return { ok: true };
  });
}
