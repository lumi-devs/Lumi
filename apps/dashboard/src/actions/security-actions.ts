"use server";

import { revalidatePath } from "next/cache";
import { type VerificationPanelSetResult } from "@lumi/contracts/views";
import { rpc } from "#/lib/rpc";
import type { ActionResult } from "#/lib/action-result";
import { guildAction } from "./_guard";

export async function setPanicMode(
  guildId: string,
  active: boolean,
  channelIds?: string[],
): Promise<ActionResult> {
  return guildAction(guildId, async (session) => {
    await rpc("guild.panic.set", {
      guildId,
      actorId: session.userId,
      data: { active, channelIds },
    });
    revalidatePath(`/guild/${guildId}/security`);
    return { ok: true };
  });
}

/**
 * Posts (or edits in place) the verification panel message. `channelId`
 * targets an existing channel; `createChannel` has the bot create a fresh
 * one instead. `deleteOldMessage` only matters when the target differs from
 * the currently tracked channel — it deletes the message left behind there.
 */
export async function postVerificationPanel(
  guildId: string,
  input: {
    channelId?: string;
    createChannel?: boolean;
    deleteOldMessage?: boolean;
  },
): Promise<ActionResult & Partial<VerificationPanelSetResult>> {
  return guildAction(guildId, async (session) => {
    const result = await rpc("guild.verificationPanel.set", {
      guildId,
      actorId: session.userId,
      data: input,
    });
    revalidatePath(`/guild/${guildId}/security`);
    return { ok: true, ...result };
  });
}

export async function deleteVerificationPanel(
  guildId: string,
): Promise<ActionResult> {
  return guildAction(guildId, async (session) => {
    await rpc("guild.verificationPanel.delete", {
      guildId,
      actorId: session.userId,
    });
    revalidatePath(`/guild/${guildId}/security`);
    return { ok: true };
  });
}

export async function restoreGuildBackup(
  guildId: string,
  backupId?: number,
): Promise<ActionResult> {
  return guildAction(guildId, async (session) => {
    await rpc("guild.backups.restore", {
      guildId,
      actorId: session.userId,
      data: { backupId },
    });
    revalidatePath(`/guild/${guildId}/security`);
    return { ok: true };
  });
}
