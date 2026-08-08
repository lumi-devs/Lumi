"use server";

import { revalidatePath } from "next/cache";
import { RPC_ACTIONS, type WarnThresholdAction } from "@lumi/contracts";
import { requireGuild } from "#/lib/auth-guards";
import { rpcCall } from "#/lib/rpc";
import { isRateLimited } from "#/lib/rate-limit";
import { runAction } from "#/lib/action-result";
import type { ActionResult } from "./guild-actions";

async function guardedModerationAction(guildId: string) {
  const session = await requireGuild(guildId);
  if (await isRateLimited(`guild-action:${session.userId}`, 60, 60_000)) {
    throw new Error("Too many requests — slow down.");
  }
  return session;
}

export async function revokeCase(
  guildId: string,
  caseNumber: number,
): Promise<ActionResult> {
  return runAction(async () => {
    const session = await guardedModerationAction(guildId);
    await rpcCall(RPC_ACTIONS.guildCasesRevoke, {
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
  return runAction(async () => {
    const session = await guardedModerationAction(guildId);
    await rpcCall(RPC_ACTIONS.guildWarnThresholdsSet, {
      guildId,
      actorId: session.userId,
      data: { warnCount, action, duration },
    });
    revalidatePath(`/guild/${guildId}/warn-thresholds`);
    return { ok: true };
  });
}

export async function deleteWarnThreshold(
  guildId: string,
  warnCount: number,
): Promise<ActionResult> {
  return runAction(async () => {
    const session = await guardedModerationAction(guildId);
    await rpcCall(RPC_ACTIONS.guildWarnThresholdsSet, {
      guildId,
      actorId: session.userId,
      data: { warnCount, action: null },
    });
    revalidatePath(`/guild/${guildId}/warn-thresholds`);
    return { ok: true };
  });
}
