"use server";

import { revalidatePath } from "next/cache";
import { type WarnThresholdAction } from "@lumi/contracts/rpc";
import { rpc } from "#/lib/rpc";
import type { ActionResult } from "./guild-actions";
import { guildAction } from "./_guard";

export async function revokeCase(
  guildId: string,
  caseNumber: number,
): Promise<ActionResult> {
  return guildAction(guildId, async (session) => {
    await rpc("guild.cases.revoke", {
      guildId,
      actorId: session.userId,
      data: { caseNumber },
    });
    revalidatePath(`/guild/${guildId}/moderation`);
    return { ok: true };
  });
}

export async function setWarnThreshold(
  guildId: string,
  warnCount: number,
  action: WarnThresholdAction,
  duration?: string | null,
): Promise<ActionResult> {
  return guildAction(guildId, async (session) => {
    await rpc("guild.warnThresholds.set", {
      guildId,
      actorId: session.userId,
      data: { warnCount, action, duration },
    });
    revalidatePath(`/guild/${guildId}/moderation/thresholds`);
    return { ok: true };
  });
}

export async function deleteWarnThreshold(
  guildId: string,
  warnCount: number,
): Promise<ActionResult> {
  return guildAction(guildId, async (session) => {
    await rpc("guild.warnThresholds.set", {
      guildId,
      actorId: session.userId,
      data: { warnCount, action: null },
    });
    revalidatePath(`/guild/${guildId}/moderation/thresholds`);
    return { ok: true };
  });
}
