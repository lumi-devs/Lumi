"use server";

import { rpc } from "#/lib/rpc";
import type { ActionResult } from "#/lib/action-result";
import { guildAction } from "./_guard";

export async function issueLogClaim(
  guildId: string,
): Promise<ActionResult & { code?: string; expiresIn?: number }> {
  return guildAction(guildId, async (session) => {
    const data = await rpc("guild.logClaims.issue", {
      guildId,
      actorId: session.userId,
    });
    return { ok: true, code: data.code, expiresIn: data.expiresIn };
  });
}

/**
 * Checks whether a channel has been claimed since `issuedAt`. Only marks the
 * claim consumed — it does not write config, so the picker just fills in the
 * field and the admin still hits the normal Save bar, same as any other edit.
 * Only one claim code is active per guild at a time, so the newest claim
 * after the code was issued is unambiguously the one it produced.
 */
export async function pollChannelClaim(
  guildId: string,
  issuedAt: string,
): Promise<ActionResult & { channelId?: string }> {
  return guildAction(guildId, async (session) => {
    const { claims } = await rpc("guild.logClaims.list", {
      guildId,
      actorId: session.userId,
    });
    const claim = claims.find((c) => c.claimedAt > issuedAt);
    if (!claim) return { ok: true };

    await rpc("guild.logClaims.dismiss", {
      guildId,
      actorId: session.userId,
      data: { channelId: claim.channelId, outcome: "confirmed" },
    });
    return { ok: true, channelId: claim.channelId };
  });
}
