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
  if (granted.length === 0 || required.length === 0) return false;
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
  const deniedMatch = bucket.deny.find((granted) => matchPermitNode(granted, requiredNode));
  if (deniedMatch !== undefined) return { verdict: "deny", match: deniedMatch };

  const grantedMatch = bucket.grant.find((granted) => matchPermitNode(granted, requiredNode));
  if (grantedMatch !== undefined) return { verdict: "allow", match: grantedMatch };

  return { verdict: "pass" };
}

export function isBotOwner(services: LumiServices, userId: string): boolean {
  if (services.runtime.ownerIds.has(userId)) return true;

  const owner = services.client.application?.owner;
  if (!owner) return false;
  if ("members" in owner) return owner.members.has(userId);
  return owner.id === userId;
}

/**
 * Resolves a permit node through every tier, in the same order Lumi v1 used:
 * owner, manager, enforced user rules, then custom user/channel/role rules.
 *
 * The first decisive tier wins. Later tiers are still evaluated and returned
 * so the explain panel can show the complete chain instead of stopping at the
 * deciding row.
 */
export async function evaluatePermit(
  services: LumiServices,
  options: PermitEvaluationOptions,
): Promise<PermitEvaluationResult> {
  const { guildId, userId, channelId, member, guildOwnerId, node } = options;
  const verdicts: PermitTierVerdict[] = [];

  if (isBotOwner(services, userId)) {
    verdicts.push({ tier: "owner", verdict: "allow", reason: "Bot owner override" });
    return { allowed: true, verdicts };
  }

  if (guildOwnerId !== null && guildOwnerId !== undefined && userId === guildOwnerId) {
    verdicts.push({ tier: "owner", verdict: "allow", reason: "Server owner override" });
    return { allowed: true, verdicts };
  }

  verdicts.push({ tier: "owner", verdict: "pass" });

  const manager = Boolean(
    member?.permissions.has(PermissionFlagsBits.Administrator) ||
      member?.permissions.has(PermissionFlagsBits.ManageGuild),
  );
  verdicts.push(
    manager
      ? { tier: "manager", verdict: "allow", reason: "Administrator or ManageGuild" }
      : { tier: "manager", verdict: "pass" },
  );
  if (manager) return { allowed: true, verdicts };

  const isQuarantined = await services.redis
    .get(services.keys.quarantine(guildId, userId))
    .then(Boolean)
    .catch(() => false);

  const roleIds = options.roleIds ?? (member?.roles.cache.map((role) => role.id) ?? []);
  const targets: Array<{
    targetType: "user" | "role" | "channel";
    targetId: string;
    label: string;
  }> = [
    { targetType: "user", targetId: userId, label: "user" },
    ...(channelId
      ? [{ targetType: "channel" as const, targetId: channelId, label: "channel" }]
      : []),
    ...roleIds.map((id) => ({ targetType: "role" as const, targetId: id, label: `role:${id}` })),
  ];

  const tiers = await services.db.permits.getPermitChain(
    guildId,
    targets.map((target) => ({
      targetType: target.targetType,
      targetId: target.targetId,
    })),
  );

  let allowed = false;
  let decided = false;

  const consider = (tier: string, verdict: "allow" | "deny" | "pass", reason?: string): void => {
    verdicts.push(reason === undefined ? { tier, verdict } : { tier, verdict, reason });
    if (!decided && verdict !== "pass") {
      decided = true;
      allowed = verdict === "allow";
    }
  };

  // Enforced rules are user-only and deliberately survive quarantine. The
  // pass row is still emitted so the explain panel mirrors the full v1 chain.
  const userTier = tiers[0];
  if (userTier) {
    const enforced = matchBucket(userTier.enforced, node);
    verdicts.push({
      tier: "enforced:user",
      verdict: enforced.verdict,
      ...(enforced.match === undefined
        ? {}
        : { reason: `Matched enforced rule: ${enforced.match}` }),
    });
    if (!decided && enforced.verdict !== "pass") {
      decided = true;
      allowed = enforced.verdict === "allow";
    }
  }

  for (let index = 0; index < tiers.length; index++) {
    const payload = tiers[index];
    const target = targets[index];
    if (!payload || !target) continue;

    const tier = `custom:${target.label}`;
    const custom = matchBucket(payload.custom, node);
    const reason =
      custom.match === undefined
        ? undefined
        : `Matched custom rule: ${custom.match}`;

    if (isQuarantined) {
      // Match v1: custom rules are still explained, but never decide while the
      // user is quarantined. Enforced rules above still apply.
      verdicts.push({
        tier,
        verdict: custom.verdict,
        reason: reason === undefined ? "Ignored while quarantined" : `${reason} (ignored while quarantined)`,
      });
      continue;
    }

    consider(tier, custom.verdict, reason);
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
