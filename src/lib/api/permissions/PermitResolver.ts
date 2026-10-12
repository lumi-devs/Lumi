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

function anyNodeMatches(nodes: readonly string[], permitNode: string): boolean {
  return nodes.some((granted) => evaluateNodeMatch(granted, permitNode));
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

export async function explainPermit(
  node: string,
  actor: ExplainPermitActor,
): Promise<PermitTierExplanation[]> {
  const { guildId, userId, roleIds = [], channelId, guildOwnerId } = actor;
  const rows: PermitTierExplanation[] = [];
  if (PermitResolver.isBotOwner(userId)) {
    rows.push({ tier: "owner", verdict: "allow", detail: "bot owner" });
  } else if (PermitResolver.isGuildOwner(guildOwnerId, userId)) {
    rows.push({ tier: "owner", verdict: "allow", detail: "server owner" });
  } else {
    rows.push({ tier: "owner", verdict: "pass" });
  }
  if (rows[0]?.verdict === "allow") return rows;
  const cached = container.client?.guilds?.cache?.get(guildId)?.members?.cache?.get(userId);
  const manager = Boolean(
    cached?.permissions?.has(PermissionFlagsBits.Administrator) ||
      cached?.permissions?.has(PermissionFlagsBits.ManageGuild),
  );
  rows.push(
    manager
      ? { tier: "manager", verdict: "allow", detail: "Administrator or ManageGuild" }
      : { tier: "manager", verdict: "pass" },
  );
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
  const userTier = tiers[0];
  if (userTier) rows.push(verdictForBucket("enforced:user", userTier.enforced, node));
  tiers.forEach((tier, index) => {
    const row = verdictForBucket(`custom:${labels[index] ?? `tier:${index}`}`, tier.custom, node);
    if (isQuarantined) {
      row.detail = row.detail
        ? `${row.detail}, ignored while quarantined`
        : "ignored while quarantined";
    }
    rows.push(row);
  });
  return rows;
}

export const permitResolver = new PermitResolver();
