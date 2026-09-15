"use server";

import { revalidatePath } from "next/cache";
import { requireBotOwner, requireGuild } from "#/lib/auth-guards";
import { rpc } from "#/lib/rpc";
import { isRateLimited } from "#/lib/rate-limit";
import { runAction, type ActionResult } from "#/lib/action-result";

// Guild-scoped rows need Manage Server on that guild; global rows (`guildId IS
// NULL`) are bot-owner only. Each entry point picks its guard explicitly.

async function guardedGuildBlocklistAction(guildId: string) {
  const session = await requireGuild(guildId);
  if (await isRateLimited(`guild-action:${session.userId}`, 60, 60_000)) {
    throw new Error("Too many requests — slow down.");
  }
  return session;
}

async function guardedGlobalBlocklistAction() {
  const session = await requireBotOwner();
  if (await isRateLimited(`system-action:${session.userId}`, 60, 60_000)) {
    throw new Error("Too many requests — slow down.");
  }
  return session;
}

export async function blockUserInGuild(
  guildId: string,
  userId: string,
  reason?: string,
): Promise<ActionResult> {
  return runAction(async () => {
    const session = await guardedGuildBlocklistAction(guildId);
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
  return runAction(async () => {
    const session = await guardedGuildBlocklistAction(guildId);
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
  return runAction(async () => {
    const session = await guardedGlobalBlocklistAction();
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
  return runAction(async () => {
    const session = await guardedGlobalBlocklistAction();
    await rpc("system.blocklist.remove", {
      actorId: session.userId,
      data: { userId },
    });
    revalidatePath("/system/blocklist");
    return { ok: true };
  });
}
