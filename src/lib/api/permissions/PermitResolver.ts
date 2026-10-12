import { PermissionFlagsBits } from "discord.js";
import { UserError } from "#src/shared/Index.ts";
import { container } from "#src/lib/Services.js";
import { envParseString } from "#src/lib/Env.js";
import type { PermitTargetType } from "#src/lib/prisma/repositories/PermissionRepository.js";

const OwnerIds: ReadonlySet<string> = new Set(
  envParseString("OWNER_IDS", "")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0),
);

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

  roleIds?: string[] | undefined;

  channelId?: string | undefined;
  guildOwnerId?: string | null | undefined;
  permitNode: string;
}

export interface PermitTierExplanation {
  tier: string;
  verdict: "allow" | "deny" | "pass";
  detail?: string | undefined;
}

function matchDetail(
  nodes: readonly string[],
  permitNode: string,
): string | undefined {
  return nodes.find((granted) => evaluateNodeMatch(granted, permitNode));
}

function verdictForBucket(
  tier: string,
  bucket: { grant: string[]; deny: string[] },
  permitNode: string,
): PermitTierExplanation {
  const deny = matchDetail(bucket.deny, permitNode);
  if (deny !== undefined) return { tier, verdict: "deny", detail: `deny ${deny}` };
  const grant = matchDetail(bucket.grant, permitNode);
  if (grant !== undefined)
    return { tier, verdict: "allow", detail: `grant ${grant}` };
  return { tier, verdict: "pass" };
}

interface EvaluatedPermit {
  rows: PermitTierExplanation[];
  allowed: boolean;
}

async function evaluatePermit(
  options: EvaluatePermitOptions,
): Promise<EvaluatedPermit> {
  const { guildId, userId, roleIds = [], channelId, permitNode, guildOwnerId } =
    options;
  if (PermitResolver.isBotOwner(userId)) {
    return {
      rows: [{ tier: "owner", verdict: "allow", detail: "bot owner" }],
      allowed: true,
    };
  }
  if (PermitResolver.isGuildOwner(guildOwnerId, userId)) {
    return {
      rows: [{ tier: "owner", verdict: "allow", detail: "server owner" }],
      allowed: true,
    };
  }
  const rows: PermitTierExplanation[] = [{ tier: "owner", verdict: "pass" }];
  let manager = false;
  if (container.client?.guilds?.cache) {
    const member = container.client.guilds.cache
      .get(guildId)
      ?.members?.cache?.get(userId);
    manager = Boolean(
      member?.permissions?.has(PermissionFlagsBits.Administrator) ||
        member?.permissions?.has(PermissionFlagsBits.ManageGuild),
    );
  }
  rows.push(
    manager
      ? { tier: "manager", verdict: "allow", detail: "Administrator or ManageGuild" }
      : { tier: "manager", verdict: "pass" },
  );
  if (manager) return { rows, allowed: true };

  const chain: Array<{ targetType: PermitTargetType; targetId: string }> = [
    { targetType: "user", targetId: userId },
    ...(channelId ? [{ targetType: "channel" as const, targetId: channelId }] : []),
    ...roleIds.map((roleId) => ({ targetType: "role" as const, targetId: roleId })),
  ];
  const labels = [
    "user",
    ...(channelId ? ["channel"] : []),
    ...roleIds.map((roleId) => `role:${roleId}`),
  ];
  const { tiers, isQuarantined } = await container.db.permissions.getPermitChain(
    guildId,
    userId,
    chain,
  );

  let allowed = false;
  let decided = false;
  const consider = (row: PermitTierExplanation): void => {
    rows.push(row);
    if (!decided && row.verdict !== "pass") {
      decided = true;
      allowed = row.verdict === "allow";
    }
  };

  const userTier = tiers[0];
  if (userTier) consider(verdictForBucket("enforced:user", userTier.enforced, permitNode));
  tiers.forEach((tier, index) => {
    const row = verdictForBucket(
      `custom:${labels[index] ?? `tier:${index}`}`,
      tier.custom,
      permitNode,
    );
    if (isQuarantined) {
      row.detail = row.detail
        ? `${row.detail}, ignored while quarantined`
        : "ignored while quarantined";
      rows.push(row);
      return;
    }
    consider(row);
  });
  return { rows, allowed };
}

export class PermitResolver {

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

  public async hasPermit(options: EvaluatePermitOptions): Promise<boolean> {
    return (await evaluatePermit(options)).allowed;
  }

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

export interface ExplainPermitActor {
  guildId: string;
  userId: string;
  roleIds?: string[] | undefined;
  channelId?: string | undefined;
  guildOwnerId?: string | null | undefined;
}

export async function explainPermit(
  node: string,
  actor: ExplainPermitActor,
): Promise<PermitTierExplanation[]> {
  const { guildId, userId, roleIds, channelId, guildOwnerId } = actor;
  const { rows } = await evaluatePermit({
    guildId,
    userId,
    roleIds,
    channelId,
    guildOwnerId,
    permitNode: node,
  });
  return rows;
}

export const permitResolver = new PermitResolver();
