import { RedisKeys, RedisTTL } from "#lib/database/redis.js";
import { Repository } from "#lib/prisma/repositories/Repository.js";
import { tryParseJSON } from "@sapphire/utilities";

export type PermitKind = "enforced" | "custom";
export type PermitTargetType = "user" | "role" | "channel";
export type PermitPolarity = "grant" | "deny";

export interface PolarityBucket {
  grant: string[];
  deny: string[];
}

export interface TargetPermitPayload {
  custom: PolarityBucket;
  enforced: PolarityBucket;
}

export interface PermitRecord {
  id: number;
  guildId: string;
  name: string;
  kind: string;
  polarity: string;
  nodes: string[];
  builtin: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PermitAssignmentRecord {
  id: number;
  permitId: number;
  guildId: string;
  targetType: string;
  targetId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PermitWithAssignments extends PermitRecord {
  assignments: PermitAssignmentRecord[];
}

/**
 * Target types a permit kind may be assigned to. Enforced permits stay
 * user-only (system-tier grants for specific trusted people); custom permits
 * may target a user, role, or channel, feeding the precedence chain in
 * PermitResolver (user > channel > role, highest-position role first).
 */
export const KIND_TARGET_TYPES: Record<PermitKind, ReadonlyArray<PermitTargetType>> = {
  enforced: ["user"],
  custom: ["user", "role", "channel"],
};

export const BUILTIN_PERMITS: ReadonlyArray<{
  name: string;
  kind: PermitKind;
  nodes: string[];
}> = [
  { name: "Extra Owner", kind: "enforced", nodes: ["*"] },
  { name: "Trusted Admin", kind: "enforced", nodes: ["admin.*"] },
];

export class PermissionRepository extends Repository {
  public async getTargetPermits(
    guildId: string,
    targetType: PermitTargetType,
    targetId: string,
  ): Promise<TargetPermitPayload> {
    const key = RedisKeys.targetPermits(guildId, targetType, targetId);
    return this.getOrSet(key, RedisTTL.permits, async () => {
      const assignments = await this.prisma.permitAssignment.findMany({
        where: { guildId, targetType, targetId },
        include: { permit: true },
      });
      return collapseAssignments(assignments);
    });
  }

  /**
   * Fetches per-tier permit payloads for the full precedence chain in one
   * batched round-trip, preserving `chainTargets`' order so PermitResolver
   * can walk it (most specific first) without N sequential lookups on the
   * hot command-execution path.
   */
  public async getPermitChain(
    guildId: string,
    userId: string,
    chainTargets: Array<{ targetType: PermitTargetType; targetId: string }>,
  ): Promise<{ tiers: TargetPermitPayload[]; isQuarantined: boolean }> {
    const keys = chainTargets.map((t) =>
      RedisKeys.targetPermits(guildId, t.targetType, t.targetId),
    );

    const rawResults = keys.length > 0 ? await this.redis.mget(...keys) : [];
    const tiers: TargetPermitPayload[] = new Array(chainTargets.length);

    const missingIndexes: number[] = [];

    for (let i = 0; i < chainTargets.length; i++) {
      const raw = rawResults[i];
      if (raw) {
        const parsed = tryParseJSON(raw) as TargetPermitPayload | null;
        if (
          parsed &&
          isPolarityBucket(parsed.custom) &&
          isPolarityBucket(parsed.enforced)
        ) {
          tiers[i] = parsed;
          continue;
        }
      }
      missingIndexes.push(i);
    }

    if (missingIndexes.length > 0) {
      const missingTargets = missingIndexes.map((i) => chainTargets[i]!);
      const assignments = await this.prisma.permitAssignment.findMany({
        where: {
          guildId,
          OR: missingTargets.map((m) => ({
            targetType: m.targetType,
            targetId: m.targetId,
          })),
        },
        include: { permit: true },
      });

      const assignmentsByTarget = new Map<string, typeof assignments>();
      for (const assignment of assignments) {
        const key = `${assignment.targetType}:${assignment.targetId}`;
        if (!assignmentsByTarget.has(key)) {
          assignmentsByTarget.set(key, []);
        }
        assignmentsByTarget.get(key)!.push(assignment);
      }

      const pipeline = this.redis.pipeline();

      for (const i of missingIndexes) {
        const target = chainTargets[i]!;
        const key = `${target.targetType}:${target.targetId}`;
        const forTarget = assignmentsByTarget.get(key) ?? [];
        const payload = collapseAssignments(forTarget);
        tiers[i] = payload;
        pipeline.setex(keys[i]!, RedisTTL.permits, JSON.stringify(payload));
      }

      await pipeline.exec();
    }

    const isQuarantined = await this.isUserQuarantined(guildId, userId);

    return { tiers, isQuarantined };
  }

  public async isUserQuarantined(
    guildId: string,
    userId: string,
  ): Promise<boolean> {
    const key = RedisKeys.quarantineState(guildId, userId);
    const exists = await this.redis.exists(key);
    return exists === 1;
  }

  public async ensureBuiltinPermits(guildId: string): Promise<void> {
    for (const builtin of BUILTIN_PERMITS) {
      await this.prisma.permit.upsert({
        where: { uq_permit_guild_name: { guildId, name: builtin.name } },
        update: {},
        create: {
          guildId,
          name: builtin.name,
          kind: builtin.kind,
          nodes: builtin.nodes,
          builtin: true,
        },
      });
    }
  }

  public async listPermits(guildId: string): Promise<PermitWithAssignments[]> {
    await this.ensureBuiltinPermits(guildId);
    return this.prisma.permit.findMany({
      where: { guildId },
      include: { assignments: true },
      orderBy: [{ builtin: "desc" }, { name: "asc" }],
    });
  }

  /**
   * Looks a permit up scoped to its guild, so a permit id belonging to another
   * guild can never be resolved.
   */
  public async getPermit(
    guildId: string,
    permitId: number,
  ): Promise<PermitRecord | null> {
    return this.prisma.permit.findFirst({ where: { id: permitId, guildId } });
  }

  public async findPermitByName(
    guildId: string,
    name: string,
  ): Promise<PermitRecord | null> {
    return this.prisma.permit.findUnique({
      where: { uq_permit_guild_name: { guildId, name } },
    });
  }

  public async createPermit(
    guildId: string,
    name: string,
    kind: PermitKind,
    nodes: string[],
    polarity: PermitPolarity = "grant",
  ): Promise<PermitRecord> {
    return this.prisma.permit.create({
      data: { guildId, name, kind, nodes, polarity, builtin: false },
    });
  }

  public async updatePermitNodes(
    guildId: string,
    permitId: number,
    nodes: string[],
  ): Promise<PermitRecord | null> {
    const { count } = await this.prisma.permit.updateMany({
      where: { id: permitId, guildId },
      data: { nodes },
    });
    if (count === 0) return null;
    const updated = await this.prisma.permit.findUnique({
      where: { id: permitId },
      include: { assignments: true },
    });
    if (!updated) return null;
    await this.invalidateAssignments(updated.assignments);
    return updated;
  }

  public async renamePermit(
    guildId: string,
    permitId: number,
    name: string,
  ): Promise<PermitRecord | null> {
    const { count } = await this.prisma.permit.updateMany({
      where: { id: permitId, guildId },
      data: { name },
    });
    if (count === 0) return null;
    return this.prisma.permit.findUnique({ where: { id: permitId } });
  }

  public async deletePermit(guildId: string, permitId: number): Promise<void> {
    const permit = await this.prisma.permit.findFirst({
      where: { id: permitId, guildId },
      include: { assignments: true },
    });
    if (!permit) return;
    await this.prisma.permit.deleteMany({ where: { id: permitId, guildId } });
    await this.invalidateAssignments(permit.assignments);
  }

  private async invalidateAssignments(
    assignments: Array<{
      guildId: string;
      targetType: string;
      targetId: string;
    }>,
  ): Promise<void> {
    if (assignments.length === 0) return;
    const keys = assignments.map((a) =>
      RedisKeys.targetPermits(
        a.guildId,
        a.targetType as PermitTargetType,
        a.targetId,
      ),
    );
    await this.invalidate(...keys);
  }

  public async assignPermit(
    guildId: string,
    permitId: number,
    targetType: PermitTargetType,
    targetId: string,
  ): Promise<PermitAssignmentRecord> {
    const permit = await this.prisma.permit.findFirst({
      where: { id: permitId, guildId },
    });
    if (!permit) throw new Error("Permit not found.");

    const assignment = await this.prisma.permitAssignment.upsert({
      where: {
        uq_permit_assignment: { permitId, targetType, targetId },
      },
      update: {},
      create: {
        permitId,
        guildId: permit.guildId,
        targetType,
        targetId,
      },
    });
    await this.invalidate(
      RedisKeys.targetPermits(permit.guildId, targetType, targetId),
    );
    return assignment;
  }

  public async unassignPermit(
    guildId: string,
    permitId: number,
    targetType: PermitTargetType,
    targetId: string,
  ): Promise<number> {
    const permit = await this.prisma.permit.findFirst({
      where: { id: permitId, guildId },
    });
    if (!permit) throw new Error("Permit not found.");

    const { count } = await this.prisma.permitAssignment.deleteMany({
      where: { permitId, guildId, targetType, targetId },
    });
    await this.invalidate(
      RedisKeys.targetPermits(permit.guildId, targetType, targetId),
    );
    return count;
  }
}

function collapseAssignments(
  assignments: Array<{
    permit: { kind: string; polarity: string; nodes: string[] };
  }>,
): TargetPermitPayload {
  const custom: PolarityBucket = { grant: [], deny: [] };
  const enforced: PolarityBucket = { grant: [], deny: [] };
  for (const { permit } of assignments) {
    const kindBucket = permit.kind === "enforced" ? enforced : custom;
    const polarityBucket =
      permit.polarity === "deny" ? kindBucket.deny : kindBucket.grant;
    polarityBucket.push(...permit.nodes);
  }
  return { custom, enforced };
}

function isPolarityBucket(value: unknown): value is PolarityBucket {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    Array.isArray((value as PolarityBucket).grant) &&
    Array.isArray((value as PolarityBucket).deny)
  );
}
