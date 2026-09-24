"use server";

import { requireBotOwner, requireGuild } from "#/lib/auth-guards";
import { isRateLimited } from "#/lib/rate-limit";
import { runAction } from "#/lib/action-result";

export interface ActionRateLimit {
  keyPrefix: string;
  limit: number;
  windowMs: number;
}

const defaultGuildRateLimit: ActionRateLimit = {
  keyPrefix: "guild-action",
  limit: 60,
  windowMs: 60_000,
};

const defaultOwnerRateLimit: ActionRateLimit = {
  keyPrefix: "system-action",
  limit: 60,
  windowMs: 60_000,
};

async function enforceRateLimit(userId: string, rateLimit: ActionRateLimit): Promise<void> {
  if (await isRateLimited(`${rateLimit.keyPrefix}:${userId}`, rateLimit.limit, rateLimit.windowMs)) {
    throw new Error("Too many requests — slow down.");
  }
}

// IDOR + rate-limit guard shared by every guild-scoped Server Action. A page
// layout only guards the render, so every action re-checks `requireGuild`
// itself rather than trusting client state. Wraps `runAction` so a thrown
// rate-limit error becomes `{ ok: false, error }` the same way an RPC failure
// does, while `notFound()`/`redirect()` from `requireGuild` still propagate.
export async function guildAction<T>(
  guildId: string,
  fn: (session: Awaited<ReturnType<typeof requireGuild>>) => Promise<T>,
  rateLimit: ActionRateLimit = defaultGuildRateLimit,
): Promise<T | { ok: false; error: string }> {
  return runAction(async () => {
    const session = await requireGuild(guildId);
    await enforceRateLimit(session.userId, rateLimit);
    return fn(session);
  });
}

// Bot-owner + rate-limit guard shared by every system-scoped Server Action.
export async function ownerAction<T>(
  fn: (session: Awaited<ReturnType<typeof requireBotOwner>>) => Promise<T>,
  rateLimit: ActionRateLimit = defaultOwnerRateLimit,
): Promise<T | { ok: false; error: string }> {
  return runAction(async () => {
    const session = await requireBotOwner();
    await enforceRateLimit(session.userId, rateLimit);
    return fn(session);
  });
}
