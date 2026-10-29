import { PermissionFlagsBits } from "discord.js";
import type { Client } from "discord.js";
import type {
  Permit,
  PermitChainResult,
  PermitChainTarget,
  PermitContainer,
  PermitConditions,
  PermitTierExplanation,
  EvaluatedPermit,
  EvaluatePermitOptions,
} from "./types.js";
import { matchesCron, zonedTimeParts } from "./cron.js";

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
    return requiredNode === namespace || requiredNode.startsWith(`${namespace}.`);
  }
  return false;
}

/**
 * The custom tiers for one user, in evaluation order: user, channel, roles.
 */
export function buildPermitChain(
  userId: string,
  channelId?: string,
  roleIds: readonly string[] = [],
): PermitChainTarget[] {
  return [
    { targetType: "USER", targetId: userId },
    ...(channelId
      ? [{ targetType: "CHANNEL" as const, targetId: channelId }]
      : []),
    ...roleIds.map((roleId) => ({
      targetType: "ROLE" as const,
      targetId: roleId,
    })),
  ];
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

/** Minutes since midnight for a stored "HH:MM" value. */
function parseClock(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const [hours, minutes] = value.split(":").map(Number);
  if (
    hours === undefined ||
    minutes === undefined ||
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }
  return hours * 60 + minutes;
}

export function matchesConditions(
  conditions: PermitConditions | null,
  options: EvaluatePermitOptions,
  fallbackTimezone?: string,
): boolean {
  if (!conditions) return true;

  // Restrictions fail closed: a channel/role-scoped permit must not apply when
  // the evaluation has no channel or roles (e.g. a prefix command in DMs).
  if (conditions.channelIds?.length) {
    if (!options.channelId || !conditions.channelIds.includes(options.channelId)) {
      return false;
    }
  }

  if (conditions.roleIds?.length) {
    const requiredRoles = conditions.roleIds;
    if (
      !options.roleIds?.length ||
      !options.roleIds.some((roleId) => requiredRoles.includes(roleId))
    ) {
      return false;
    }
  }

  if (conditions.notRoleIds?.length && options.roleIds) {
    const deniedRoles = conditions.notRoleIds;
    if (options.roleIds.some((roleId) => deniedRoles.includes(roleId))) {
      return false;
    }
  }

  if (conditions.timeWindow) {
    const now = options.at ?? new Date();
    let local: ReturnType<typeof zonedTimeParts>;
    try {
      local = zonedTimeParts(now, conditions.timezone ?? fallbackTimezone);
    } catch {
      // An invalid stored timezone must not throw on every evaluation; treat
      // the condition as unmatched, like an invalid cron schedule.
      return false;
    }
    const currentTime = local.hour * 60 + local.minute;

    const startTime = parseClock(conditions.timeWindow.start);
    const endTime = parseClock(conditions.timeWindow.end);
    if (startTime === null || endTime === null) return false;

    const inWindow =
      startTime <= endTime
        ? currentTime >= startTime && currentTime <= endTime
        : currentTime >= startTime || currentTime <= endTime;
    if (!inWindow) return false;

    if (
      conditions.timeWindow.days?.length &&
      !conditions.timeWindow.days.includes(local.dayOfWeek)
    ) {
      return false;
    }
  }

  return true;
}

export function isPermitValid(
  permit: Pick<Permit, "expiresAt" | "schedule" | "timezone">,
  at: Date,
): boolean {
  if (permit.expiresAt && permit.expiresAt < at) return false;
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
  client?: Client,
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

  const member = client?.guilds.cache.get(guildId)?.members.cache.get(userId);
  const manager = Boolean(
    member?.permissions.has(PermissionFlagsBits.Administrator) ||
      member?.permissions.has(PermissionFlagsBits.ManageGuild),
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
  client?: Client,
): EvaluatedPermit {
  const { roleIds = [], channelId, permitNode } = options;

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
  container: PermitContainer,
): Promise<EvaluatedPermit> {
  const { guildId, userId, roleIds = [] } = options;

  const privileged = privilegedResult(options, container.client);
  if (privileged) return privileged;

  const chainResult = await container.db.permits.getPermitChain(
    guildId,
    userId,
    buildPermitChain(userId, options.channelId, roleIds),
  );

  return evaluatePermitWithChain(options, chainResult, container.client);
}

export function isBotOwner(userId: string): boolean {
  return OwnerIds.has(userId);
}

export function isGuildOwner(
  guildOwnerId: string | null | undefined,
  userId: string,
): boolean {
  return Boolean(guildOwnerId && guildOwnerId === userId);
}

export class PermitResolver {
  public evaluateNodeMatch(grantedNode: string, requiredNode: string): boolean {
    return evaluateNodeMatch(grantedNode, requiredNode);
  }

  public async hasPermit(
    options: EvaluatePermitOptions,
    container: PermitContainer,
  ): Promise<boolean> {
    return (await evaluatePermit(options, container)).allowed;
  }

  public async assertPermit(
    options: EvaluatePermitOptions,
    container: PermitContainer,
  ): Promise<void> {
    const allowed = await this.hasPermit(options, container);
    if (!allowed) {
      throw new Error(`Permission denied: missing permit \`${options.permitNode}\``);
    }
  }
}
