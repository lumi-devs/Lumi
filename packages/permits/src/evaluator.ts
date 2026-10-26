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

export function matchesConditions(conditions: PermitConditions | null, options: EvaluatePermitOptions): boolean {
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

export function isPermitValid(permit: any, at: Date): boolean {
  if (permit.expiresAt && new Date(permit.expiresAt) < at) return false;
  const schedule = permit.schedule;
  if (typeof schedule === "string" && schedule.trim().length > 0) {
    if (!matchesCron(schedule, at, permit.timezone ?? undefined)) {
      return false;
    }
  }
  return true;
}

function privilegedResult(
  options: EvaluatePermitOptions,
  client: any,
): EvaluatedPermit | null {
  const { guildId, userId, guildOwnerId } = options;

  if (OwnerIds.has(userId)) {
    return {
      rows: [{ tier: "owner", verdict: "allow", detail: "bot owner" }],
      allowed: true,
    };
  }

  if (guildOwnerId && guildOwnerId === userId) {
    return {
      rows: [{ tier: "owner", verdict: "allow", detail: "server owner" }],
      allowed: true,
    };
  }

  const member = client?.guilds?.cache
    ?.get(guildId)
    ?.members?.cache?.get(userId);
  const manager = Boolean(
    member?.permissions?.has(PermissionFlagsBits.Administrator) ||
      member?.permissions?.has(PermissionFlagsBits.ManageGuild),
  );

  if (!manager) return null;

  return {
    rows: [
      { tier: "owner", verdict: "pass" },
      {
        tier: "manager",
        verdict: "allow",
        detail: "Administrator or ManageGuild",
      },
    ],
    allowed: true,
  };
}

export function evaluatePermitWithChain(
  options: EvaluatePermitOptions,
  chainResult: PermitChainResult,
  client?: any,
): EvaluatedPermit {
  const { userId, roleIds = [], channelId, permitNode } = options;

  const privileged = privilegedResult(options, client);
  if (privileged) return privileged;

  const rows: PermitTierExplanation[] = [
    { tier: "owner", verdict: "pass" },
    { tier: "manager", verdict: "pass" },
  ];

  let allowed = false;
  let decided = false;
  const consider = (row: PermitTierExplanation): void => {
    rows.push(row);
    if (!decided && row.verdict !== "pass") {
      decided = true;
      allowed = row.verdict === "allow";
    }
  };

  const labels = [
    "user",
    ...(channelId ? ["channel"] : []),
    ...roleIds.map((roleId) => `role:${roleId}`),
  ];

  chainResult.tiers.forEach((tier, index) => {
    const label = labels[index] ?? `tier:${index}`;
    const row = verdictForBucket(`custom:${label}`, tier.custom, permitNode);

    if (chainResult.isQuarantined) {
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

export async function evaluatePermit(
  options: EvaluatePermitOptions,
  container: {
    db: {
      permits: {
        getPermitChain: (
          guildId: string,
          userId: string,
          chain: Array<{ targetType: PermitTargetType; targetId: string }>,
        ) => Promise<PermitChainResult>;
      };
    };
    client?: any;
  },
): Promise<EvaluatedPermit> {
  const { guildId, userId, roleIds = [], channelId } = options;

  const privileged = privilegedResult(options, container.client);
  if (privileged) return privileged;

  const chain: Array<{ targetType: PermitTargetType; targetId: string }> = [
    { targetType: "USER", targetId: userId },
    ...(channelId
      ? [{ targetType: "CHANNEL" as const, targetId: channelId }]
      : []),
    ...roleIds.map((roleId) => ({
      targetType: "ROLE" as const,
      targetId: roleId,
    })),
  ];

  const chainResult = await container.db.permits.getPermitChain(
    guildId,
    userId,
    chain,
  );

  return evaluatePermitWithChain(options, chainResult, container.client);
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