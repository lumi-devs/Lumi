import { RedisKeys, RedisTTL } from "#lib/database/redis.js";
import { Repository } from "#lib/prisma/repositories/Repository.js";
import { tryParseJSON } from "@sapphire/utilities";

export type PermitKind = "enforced" | "custom";
export type PermitTargetType = "user" | "role";

export interface TargetPermitPayload {
  custom: string[];
  enforced: string[];
}

export interface UserPermitSet {
  customPermits: Set<string>;
  enforcedPermits: Set<string>;
  isQuarantined: boolean;
}

export interface PermitRecord {
  id: number;
  guildId: string;
  name: string;
  kind: string;
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

export const KIND_TARGET_TYPE: Record<PermitKind, PermitTargetType> = {
  enforced: "user",
  custom: "role",
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

  public async getUserPermits(
    guildId: string,
    userId: string,
    roleIds: string[] = [],
  ): Promise<UserPermitSet> {
    const targets: Array<{ targetType: PermitTargetType; targetId: string }> = [
      { targetType: "user", targetId: userId },
      ...roleIds.map((targetId) => ({ targetType: "role" as const, targetId })),
    ];

    const keys = targets.map((t) =>
      RedisKeys.targetPermits(guildId, t.targetType, t.targetId),
    );

    const rawResults = await this.redis.mget(...keys);

    const customPermits = new Set<string>();
    const enforcedPermits = new Set<string>();

    const missingTargets: Array<{
      targetType: PermitTargetType;
      targetId: string;
      key: string;
    }> = [];

    for (let i = 0; i < targets.length; i++) {
      const target = targets[i]!;
      const raw = rawResults[i];
      if (raw) {
        const parsed = tryParseJSON(raw) as TargetPermitPayload | null;
        if (
          parsed &&
          Array.isArray(parsed.custom) &&
          Array.isArray(parsed.enforced)
        ) {
          for (const p of parsed.custom) customPermits.add(p);
          for (const p of parsed.enforced) enforcedPermits.add(p);
          continue;
        }
      }
      missingTargets.push({ ...target, key: keys[i]! });
    }

    if (missingTargets.length > 0) {
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

      for (const missing of missingTargets) {
        const key = `${missing.targetType}:${missing.targetId}`;
        const forTarget = assignmentsByTarget.get(key) ?? [];
        const payload = collapseAssignments(forTarget);

        for (const p of payload.custom) customPermits.add(p);
        for (const p of payload.enforced) enforcedPermits.add(p);

        pipeline.setex(missing.key, RedisTTL.permits, JSON.stringify(payload));
      }

      await pipeline.exec();
    }

    const isQuarantined = await this.isUserQuarantined(guildId, userId);

    return {
      customPermits: isQuarantined ? new Set<string>() : customPermits,
      enforcedPermits,
      isQuarantined,
    };
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

  public async getPermit(permitId: number): Promise<PermitRecord | null> {
    return this.prisma.permit.findUnique({ where: { id: permitId } });
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
  ): Promise<PermitRecord> {
    return this.prisma.permit.create({
      data: { guildId, name, kind, nodes, builtin: false },
    });
  }

  public async updatePermitNodes(
    permitId: number,
    nodes: string[],
  ): Promise<PermitRecord> {
    const updated = await this.prisma.permit.update({
      where: { id: permitId },
      data: { nodes },
      include: { assignments: true },
    });
    await this.invalidateAssignments(updated.assignments);
    return updated;
  }

  public async renamePermit(
    permitId: number,
    name: string,
  ): Promise<PermitRecord> {
    return this.prisma.permit.update({
      where: { id: permitId },
      data: { name },
    });
  }

  public async deletePermit(permitId: number): Promise<void> {
    const permit = await this.prisma.permit.findUnique({
      where: { id: permitId },
      include: { assignments: true },
    });
    if (!permit) return;
    await this.prisma.permit.delete({ where: { id: permitId } });
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
    permitId: number,
    targetId: string,
  ): Promise<PermitAssignmentRecord> {
    const permit = await this.prisma.permit.findUnique({
      where: { id: permitId },
    });
    if (!permit) throw new Error("Permit not found.");
    const targetType = KIND_TARGET_TYPE[permit.kind as PermitKind];

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
    permitId: number,
    targetId: string,
  ): Promise<number> {
    const permit = await this.prisma.permit.findUnique({
      where: { id: permitId },
    });
    if (!permit) throw new Error("Permit not found.");
    const targetType = KIND_TARGET_TYPE[permit.kind as PermitKind];

    const { count } = await this.prisma.permitAssignment.deleteMany({
      where: { permitId, targetType, targetId },
    });
    await this.invalidate(
      RedisKeys.targetPermits(permit.guildId, targetType, targetId),
    );
    return count;
  }
}

function collapseAssignments(
  assignments: Array<{ permit: { kind: string; nodes: string[] } }>,
): TargetPermitPayload {
  const custom: string[] = [];
  const enforced: string[] = [];
  for (const { permit } of assignments) {
    const bucket = permit.kind === "enforced" ? enforced : custom;
    bucket.push(...permit.nodes);
  }
  return { custom, enforced };
}
