import { PermissionFlagsBits, type GuildMember } from "discord.js";
import type { PermitKind, PermitPolarity, PermitTargetType } from "@lumi/db";
import type { LumiServices } from "./services.ts";

export type { PermitKind, PermitPolarity, PermitTargetType };

export interface PermitEvaluationTarget {
  guildId: string;
  userId: string;
  channelId?: string | undefined;
  member?: GuildMember | null | undefined;
  guildOwnerId?: string | null | undefined;
  roleIds?: string[] | undefined;
}

export interface PermitEvaluationOptions extends PermitEvaluationTarget {
  node: string;
}

export interface PermitTierVerdict {
  tier: string;
  verdict: "allow" | "deny" | "pass";
  reason?: string | undefined;
}

export interface PermitEvaluationResult {
  allowed: boolean;
  verdicts: PermitTierVerdict[];
}

export function matchPermitNode(granted: string, required: string): boolean {
  if (granted === "*" || granted === required) return true;
  if (granted.endsWith(".*")) {
    const prefix = granted.slice(0, -2);
    return required === prefix || required.startsWith(`${prefix}.`);
  }
  return false;
}

function matchBucket(
  bucket: { grant: string[]; deny: string[] },
  requiredNode: string,
): { verdict: "allow" | "deny" | "pass"; match?: string } {
  const deniedMatch = bucket.deny.find((g) => matchPermitNode(g, requiredNode));
  if (deniedMatch) return { verdict: "deny", match: deniedMatch };

  const grantedMatch = bucket.grant.find((g) => matchPermitNode(g, requiredNode));
  if (grantedMatch) return { verdict: "allow", match: grantedMatch };

  return { verdict: "pass" };
}

export async function evaluatePermit(
  services: LumiServices,
  options: PermitEvaluationOptions,
): Promise<PermitEvaluationResult> {
  const { guildId, userId, channelId, member, guildOwnerId, node } = options;
  const verdicts: PermitTierVerdict[] = [];

  // 1. Bot Owner
  if (services.runtime.ownerIds.has(userId)) {
    verdicts.push({ tier: "bot-owner", verdict: "allow", reason: "Bot owner override" });
    return { allowed: true, verdicts };
  }

  // 2. Server Owner
  if (guildOwnerId && userId === guildOwnerId) {
    verdicts.push({ tier: "guild-owner", verdict: "allow", reason: "Server owner override" });
    return { allowed: true, verdicts };
  }

  // 3. Admin / ManageGuild permissions
  if (
    member?.permissions.has(PermissionFlagsBits.Administrator) ||
    member?.permissions.has(PermissionFlagsBits.ManageGuild)
  ) {
    verdicts.push({ tier: "administrator", verdict: "allow", reason: "Administrator or ManageGuild permission" });
    return { allowed: true, verdicts };
  }

  // Check quarantine state
  const isQuarantined = await services.redis
    .get(services.keys.quarantine(guildId, userId))
    .then(Boolean)
    .catch(() => false);

  // Build target chain
  const roleIds = options.roleIds ?? (member?.roles.cache.map((r) => r.id) ?? []);
  const targets: Array<{ targetType: "user" | "role" | "channel"; targetId: string; label: string }> = [
    { targetType: "user", targetId: userId, label: `user:${userId}` },
    ...(channelId ? [{ targetType: "channel" as const, targetId: channelId, label: `channel:${channelId}` }] : []),
    ...roleIds.map((id) => ({ targetType: "role" as const, targetId: id, label: `role:${id}` })),
  ];

  const tiers = await services.db.permits.getPermitChain(
    guildId,
    targets.map((t) => ({ targetType: t.targetType, targetId: t.targetId })),
  );

  let allowed = false;
  let decided = false;

  const applyVerdict = (tier: string, verdict: "allow" | "deny" | "pass", reason?: string) => {
    verdicts.push(reason !== undefined ? { tier, verdict, reason } : { tier, verdict });
    if (!decided && verdict !== "pass") {
      decided = true;
      allowed = verdict === "allow";
    }
  };

  // Enforced user bucket
  const userTier = tiers[0];
  if (userTier) {
    const enforcedMatch = matchBucket(userTier.enforced, node);
    if (enforcedMatch.verdict !== "pass") {
      applyVerdict("enforced:user", enforcedMatch.verdict, `Matched enforced rule: ${enforcedMatch.match}`);
    }
  }

  // Custom tiers
  for (let i = 0; i < tiers.length; i++) {
    const tierPayload = tiers[i];
    const targetInfo = targets[i];
    if (!tierPayload || !targetInfo) continue;

    if (isQuarantined && targetInfo.targetType !== "user") {
      verdicts.push({
        tier: `custom:${targetInfo.label}`,
        verdict: "pass",
        reason: "Ignored while user is quarantined",
      });
      continue;
    }

    const customMatch = matchBucket(tierPayload.custom, node);
    if (customMatch.verdict !== "pass") {
      applyVerdict(`custom:${targetInfo.label}`, customMatch.verdict, `Matched custom rule: ${customMatch.match}`);
    } else {
      verdicts.push({ tier: `custom:${targetInfo.label}`, verdict: "pass" });
    }
  }

  return { allowed, verdicts };
}

export async function hasPermit(
  services: LumiServices,
  options: PermitEvaluationOptions,
): Promise<boolean> {
  const result = await evaluatePermit(services, options);
  return result.allowed;
}

export async function assertPermit(
  services: LumiServices,
  options: PermitEvaluationOptions,
): Promise<void> {
  const allowed = await hasPermit(services, options);
  if (!allowed) {
    throw new Error(`You lack the required permit (\`${options.node}\`) to use this.`);
  }
}
