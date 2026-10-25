import { PermissionFlagsBits } from "discord.js";
import type { 
  PermitKind, 
  Polarity, 
  PermitTargetType,
  EvaluatePermitOptions, 
  PermitTierExplanation, 
  EvaluatedPermit,
  PermitConditions,
  PermitChainResult 
} from "./types.js";
import { matchesCron } from "./cron.js";

const OwnerIds: ReadonlySet<string> = new Set(
  (process.env.OWNER_IDS ?? "")
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

function matchesConditions(conditions: PermitConditions | null, options: EvaluatePermitOptions): boolean {
  if (!conditions) return true;
  
  if (conditions.channelIds?.length && options.channelId) {
    if (!conditions.channelIds.includes(options.channelId)) return false;
  }
  
  if (conditions.roleIds?.length && options.roleIds) {
    if (!options.roleIds.some(r => conditions.roleIds!.includes(r))) return false;
  }
  
  if (conditions.notRoleIds?.length && options.roleIds) {
    if (options.roleIds.some(r => conditions.notRoleIds!.includes(r))) return false;
  }
  
  if (conditions.timeWindow) {
    const now = options.at ?? new Date();
    const currentHour = now.getUTCHours();
    const currentMinute = now.getUTCMinutes();
    const currentTime = currentHour * 60 + currentMinute;
    
    const [startHour, startMin] = conditions.timeWindow.start.split(":").map(Number);
    const [endHour, endMin] = conditions.timeWindow.end.split(":").map(Number);
    const startTime = startHour * 60 + startMin;
    const endTime = endHour * 60 + endMin;
    
    let inWindow = false;
    if (startTime <= endTime) {
      inWindow = currentTime >= startTime && currentTime <= endTime;
    } else {
      inWindow = currentTime >= startTime || currentTime <= endTime;
    }
    
    if (!inWindow) return false;
    
    if (conditions.timeWindow.days?.length) {
      const day = now.getUTCDay();
      if (!conditions.timeWindow.days.includes(day)) return false;
    }
  }
  
  return true;
}

function isPermitValid(permit: any, at: Date): boolean {
  if (permit.expiresAt && new Date(permit.expiresAt) < at) return false;
  if (permit.schedule && permit.schedule.trim()) {
    if (!matchesCron(permit.schedule, at, permit.timezone ?? undefined)) {
      return false;
    }
  }
  return true;
}

export async function evaluatePermit(
  options: EvaluatePermitOptions,
  container: { 
    db: { permits: { getPermitChain: (guildId: string, userId: string, chain: Array<{ targetType: PermitTargetType; targetId: string }>) => Promise<PermitChainResult> } };
    client?: any;
  },
): Promise<EvaluatedPermit> {
  const { guildId, userId, roleIds = [], channelId, permitNode, guildOwnerId } = options;
  const at = options.at ?? new Date();
  
  // Tier 1: Bot Owner
  if (OwnerIds.has(userId)) {
    return {
      rows: [{ tier: "owner", verdict: "allow", detail: "bot owner" }],
      allowed: true,
    };
  }
  
  // Tier 2: Guild Owner
  if (guildOwnerId && guildOwnerId === userId) {
    return {
      rows: [{ tier: "owner", verdict: "allow", detail: "server owner" }],
      allowed: true,
    };
  }
  
  const rows: PermitTierExplanation[] = [{ tier: "owner", verdict: "pass" }];
  
  // Tier 3: Discord Manager (Administrator / ManageGuild)
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

  // Custom permits only (user -> channel -> roles in position order)
  const chain: Array<{ targetType: PermitTargetType; targetId: string }> = [
    { targetType: "USER", targetId: userId },
    ...(channelId ? [{ targetType: "CHANNEL" as const, targetId: channelId }] : []),
    ...roleIds.map((roleId) => ({ targetType: "ROLE" as const, targetId: roleId })),
  ];
  
  const { tiers, isQuarantined } = await container.db.permits.getPermitChain(
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

  // All tiers are custom permits evaluated in position order
  const labels = [
    "user",
    ...(channelId ? ["channel"] : []),
    ...roleIds.map((roleId) => `role:${roleId}`),
  ];
  
  tiers.forEach((tier, index) => {
    const label = labels[index] ?? `tier:${index}`;
    const row = verdictForBucket(
      `custom:${label}`,
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

export function isBotOwner(userId: string): boolean {
  if (OwnerIds.has(userId)) return true;
  return false;
}

export function isGuildOwner(guildOwnerId: string | null | undefined, userId: string): boolean {
  return Boolean(guildOwnerId && guildOwnerId === userId);
}

export class PermitResolver {
  public evaluateNodeMatch(grantedNode: string, requiredNode: string): boolean {
    return evaluateNodeMatch(grantedNode, requiredNode);
  }

  public async hasPermit(
    options: EvaluatePermitOptions,
    container: { 
      db: { permits: { getPermitChain: (guildId: string, userId: string, chain: Array<{ targetType: PermitTargetType; targetId: string }>) => Promise<PermitChainResult> } };
      client?: any;
    },
  ): Promise<boolean> {
    return (await evaluatePermit(options, container)).allowed;
  }

  public async assertPermit(
    options: EvaluatePermitOptions,
    container: { 
      db: { permits: { getPermitChain: (guildId: string, userId: string, chain: Array<{ targetType: PermitTargetType; targetId: string }>) => Promise<PermitChainResult> } };
      client?: any;
    },
  ): Promise<void> {
    const allowed = await this.hasPermit(options, container);
    if (!allowed) {
      throw new Error(`Permission denied: missing permit \`${options.permitNode}\``);
    }
  }
}