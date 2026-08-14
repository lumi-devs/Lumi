import { container, UserError } from "@sapphire/framework";
import { envParseString } from "#lib/env.js";

const OWNER_IDS: ReadonlySet<string> = new Set(
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
  roleIds?: string[];
  guildOwnerId?: string | null;
  permitNode: string;
}

/**
 * Wick-style Permit Resolver evaluating granular permit nodes, owner bypasses,
 * wildcard node matching, and Anti-Nuke Quarantine interception.
 */
export class PermitResolver {
  /** Checks if a user is a Bot Owner (via OWNER_IDS env or application owner). */
  public static isBotOwner(userId: string): boolean {
    if (OWNER_IDS.has(userId)) return true;
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
   * Resolves raw permit sets and quarantine status for a user in a guild.
   */
  public async resolveUserPermits(
    guildId: string,
    userId: string,
    roleIds: string[] = [],
  ): Promise<{
    customPermits: Set<string>;
    enforcedPermits: Set<string>;
    isQuarantined: boolean;
  }> {
    return container.db.getUserPermits(guildId, userId, roleIds);
  }

  /**
   * Evaluates if a user possesses the required permit node in a guild.
   * Handles Owner Bypasses (Bot Owner, Guild Owner), Enforced Permits,
   * Anti-Nuke Quarantine Interception (stripping Custom Permits), and Custom Permits.
   */
  public async hasPermit(options: EvaluatePermitOptions): Promise<boolean> {
    const { guildId, userId, roleIds = [], permitNode, guildOwnerId } = options;

    if (
      PermitResolver.isBotOwner(userId) ||
      PermitResolver.isGuildOwner(guildOwnerId, userId)
    ) {
      return true;
    }

    const { customPermits, enforcedPermits, isQuarantined } =
      await this.resolveUserPermits(guildId, userId, roleIds);

    for (const granted of enforcedPermits) {
      if (evaluateNodeMatch(granted, permitNode)) {
        return true;
      }
    }

    if (!isQuarantined) {
      for (const granted of customPermits) {
        if (evaluateNodeMatch(granted, permitNode)) {
          return true;
        }
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
