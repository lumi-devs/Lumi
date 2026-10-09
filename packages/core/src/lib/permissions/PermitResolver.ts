import { PermissionFlagsBits } from "discord.js";
import { UserError } from "@lumi/shared";
import { container } from "#lib/services.js";
import { envParseString } from "#lib/env.js";
import type { PermitTargetType } from "#lib/prisma/repositories/PermissionRepository.js";

const OwnerIds: ReadonlySet<string> = new Set(
  envParseString("OWNER_IDS", "")
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

  public static isGuildOwner(
    guildOwnerId: string | null | undefined,
    userId: string,
  ): boolean {
    return Boolean(guildOwnerId && guildOwnerId === userId);
  }

  public evaluateNodeMatch(grantedNode: string, requiredNode: string): boolean {
    return evaluateNodeMatch(grantedNode, requiredNode);
  }

  /**
   * Checks permit node match against hierarchy: Owner bypass > Enforced user permits
   * > Custom user permits > Channel permits > Role permits (highest position first).
   * Deny takes precedence within tier. Anti-nuke quarantine suppresses custom permits.
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

    if (container.client?.guilds?.cache) {
      const g = container.client.guilds.cache.get(guildId);
      const m = g?.members?.cache?.get(userId);
      if (m?.permissions?.has(PermissionFlagsBits.Administrator) || m?.permissions?.has(PermissionFlagsBits.ManageGuild)) {
        return true;
      }
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
        message: `You lack the required permit (\`${options.permitNode}\`) to use this.`,
      });
    }
  }
}

export const permitResolver = new PermitResolver();
