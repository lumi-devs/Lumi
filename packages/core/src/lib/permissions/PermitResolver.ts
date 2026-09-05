import { container, UserError } from "@sapphire/framework";
import { envParseString } from "#lib/env.js";
import type { PermitTargetType } from "#lib/prisma/repositories/PermissionRepository.js";

const OwnerIds: ReadonlySet<string> = new Set(
  envParseString("OwnerIds", "")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0),
);

/**
 * Checks if a granted permit node matches a required permit node.
 * Supports exact match, wildcard '*', and section wildcards (e.g. 'mod.*' matching 'mod.ban').
 */
export function evaluateNodeMatch(
  grantedNode: string,
  requiredNode: string,
): boolean {
  if (!grantedNode || !requiredNode) return false;
  if (grantedNode === "*" || grantedNode === requiredNode) {
    return true;
  }
  if (grantedNode.endsWith(".*")) {
    const namespace = grantedNode.slice(0, -2);
    return requiredNode === namespace || requiredNode.startsWith(namespace + ".");
  }
  return false;
}

export interface EvaluatePermitOptions {
  guildId: string;
  userId: string;
  /** Position-ordered highest-to-lowest (see `memberRoleIds`) - order decides precedence when roles disagree. */
  roleIds?: string[];
  /** The channel the command ran in, if any - sits between the user and role tiers in precedence. */
  channelId?: string;
  guildOwnerId?: string | null;
  permitNode: string;
}

function anyNodeMatches(nodes: readonly string[], permitNode: string): boolean {
  return nodes.some((granted) => evaluateNodeMatch(granted, permitNode));
}

/**
 * Wick-style Permit Resolver evaluating granular permit nodes, owner bypasses,
 * wildcard node matching, and Anti-Nuke Quarantine interception.
 */
export class PermitResolver {
  /** Checks if a user is a Bot Owner (via OwnerIds env or application owner). */
  public static isBotOwner(userId: string): boolean {
    if (OwnerIds.has(userId)) return true;
    const app = container.client?.application;
    if (app?.owner) {
      if ("members" in app.owner) {
        if (app.owner.members.has(userId)) return true;
      } else if (app.owner.id === userId) {
        return true;
      }
    }
    return false;
  }

  /** Checks if a user is the Guild Owner. */
  public static isGuildOwner(
    guildOwnerId: string | null | undefined,
    userId: string,
  ): boolean {
    return Boolean(guildOwnerId && guildOwnerId === userId);
  }

  /** Helper for matching permit nodes. */
  public evaluateNodeMatch(grantedNode: string, requiredNode: string): boolean {
    return evaluateNodeMatch(grantedNode, requiredNode);
  }

  /**
   * Evaluates if a user possesses the required permit node in a guild.
   *
   * Precedence, most specific first: Owner Bypasses (Bot Owner, Guild Owner)
   * > the user's own Enforced permits (system-tier, quarantine-immune) > the
   * user's own Custom permits > the current channel's Custom permits > each
   * of the user's roles' Custom permits, highest role position first. Within
   * a tier, a Deny-polarity match wins over a Grant-polarity match at the
   * same tier. The first tier with any match (deny or grant) decides the
   * whole check; nothing matching anywhere falls through to deny.
   *
   * Anti-Nuke Quarantine strips Custom permits (both polarities, every tier)
   * for the requesting user - Enforced permits still apply regardless, since
   * they're the fixed system tiers a quarantine must not be able to bypass.
   */
  public async hasPermit(options: EvaluatePermitOptions): Promise<boolean> {
    const { guildId, userId, roleIds = [], channelId, permitNode, guildOwnerId } =
      options;

    if (
      PermitResolver.isBotOwner(userId) ||
      PermitResolver.isGuildOwner(guildOwnerId, userId)
    ) {
      return true;
    }

    const chain: Array<{ targetType: PermitTargetType; targetId: string }> = [
      { targetType: "user", targetId: userId },
      ...(channelId ? [{ targetType: "channel" as const, targetId: channelId }] : []),
      ...roleIds.map((roleId) => ({ targetType: "role" as const, targetId: roleId })),
    ];

    const { tiers, isQuarantined } = await container.db.permissions.getPermitChain(
      guildId,
      userId,
      chain,
    );

    // Enforced permits are only ever assigned to the "user" target type
    // (KindTargetTypes.enforced), which is always chain[0]/tiers[0] here.
    const userTier = tiers[0];
    if (userTier) {
      if (anyNodeMatches(userTier.enforced.deny, permitNode)) return false;
      if (anyNodeMatches(userTier.enforced.grant, permitNode)) return true;
    }

    if (!isQuarantined) {
      for (const tier of tiers) {
        if (anyNodeMatches(tier.custom.deny, permitNode)) return false;
        if (anyNodeMatches(tier.custom.grant, permitNode)) return true;
      }
    }

    return false;
  }

  /**
   * Asserts that a user has a required permit node, throwing a UserError if denied.
   */
  public async assertPermit(options: EvaluatePermitOptions): Promise<void> {
    const allowed = await this.hasPermit(options);
    if (!allowed) {
      throw new UserError({
        identifier: "PermissionDenied",
        message: `You lack the required permit node (\`${options.permitNode}\`) to execute this command.`,
      });
    }
  }
}

export const permitResolver = new PermitResolver();
