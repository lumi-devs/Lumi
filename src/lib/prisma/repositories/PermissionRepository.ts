import { CacheKeys, CacheTTL } from "#src/lib/cache/Keys.js";
import { cacheStore } from "#src/lib/cache/CacheStore.js";
import { Repository } from "#src/lib/prisma/repositories/Repository.js";

export type PermitKind = "enforced" | "custom";
export type PermitTargetType = "user" | "role" | "channel";
export type PermitPolarity = "grant" | "deny";

interface PolarityBucket {
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
  position: number;
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

export const KindTargetTypes: Record<PermitKind, ReadonlyArray<PermitTargetType>> = {
  enforced: ["user"],
  custom: ["user", "role", "channel"],
};

const BuiltinPermits: ReadonlyArray<{
  name: string;
  kind: PermitKind;
  nodes: string[];
}> = [
  { name: "Extra Owner", kind: "enforced", nodes: ["*"] },
  { name: "Trusted Admin", kind: "enforced", nodes: ["admin.*"] },
];

export class PermissionRepository extends Repository {

  public async getPermitChain(
    guildId: string,
    userId: string,
    chainTargets: Array<{ targetType: PermitTargetType; targetId: string }>,
  ): Promise<{ tiers: TargetPermitPayload[]; isQuarantined: boolean }> {
    const keys = chainTargets.map((t) =>
      CacheKeys.targetPermits(guildId, t.targetType, t.targetId),
    );

    const quarantineKey = CacheKeys.quarantineState(guildId, userId);
    const rawQuarantine = cacheStore.get<string>(quarantineKey);
    const isQuarantined = rawQuarantine != null && rawQuarantine !== "0";
    const tiers: TargetPermitPayload[] = new Array(chainTargets.length);

    const missingIndexes: number[] = [];

    for (let i = 0; i < chainTargets.length; i++) {
      const cached = cacheStore.get<TargetPermitPayload>(keys[i]!);
      if (
        cached &&
        isPolarityBucket(cached.custom) &&
        isPolarityBucket(cached.enforced)
      ) {
        tiers[i] = cached;
        continue;
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

      for (const i of missingIndexes) {
        const target = chainTargets[i]!;
        const key = `${target.targetType}:${target.targetId}`;
        const forTarget = assignmentsByTarget.get(key) ?? [];
        const payload = collapseAssignments(forTarget);
        tiers[i] = payload;
        cacheStore.set(keys[i]!, payload, CacheTTL.permits * 1000);
      }
    }

    return { tiers, isQuarantined };
  }

  public async ensureBuiltinPermits(guildId: string): Promise<void> {
    await this.db.ensureGuild(guildId);
    await this.prisma.$transaction(
      BuiltinPermits.map((builtin) =>
        this.prisma.permit.upsert({
          where: { uq_permit_guild_name: { guildId, name: builtin.name } },
          update: {},
          create: {
            guildId,
            name: builtin.name,
            kind: builtin.kind,
            nodes: builtin.nodes,
            builtin: true,
          },
        }),
      ),
    );
  }

  public async listPermits(guildId: string): Promise<PermitWithAssignments[]> {
    await this.ensureBuiltinPermits(guildId);
    await this.normalizePositions(guildId);
    return this.prisma.permit.findMany({
      where: { guildId },
      include: { assignments: true },
      orderBy: [{ position: "asc" }, { builtin: "desc" }, { name: "asc" }],
    });
  }

  public async normalizePositions(guildId: string): Promise<void> {
    const permits = await this.prisma.permit.findMany({
      where: { guildId },
      select: { id: true, position: true, builtin: true, name: true },
      orderBy: [{ position: "asc" }, { builtin: "desc" }, { name: "asc" }, { id: "asc" }],
    });
    const writes = permits.flatMap((p, i) =>
      p.position === i ? [] : [this.prisma.permit.update({ where: { id: p.id }, data: { position: i } })],
    );
    if (writes.length > 0) await this.prisma.$transaction(writes);
  }

  public async movePermit(
    guildId: string,
    permitId: number,
    direction: "up" | "down",
  ): Promise<boolean> {
    await this.normalizePositions(guildId);
    const permits = await this.prisma.permit.findMany({
      where: { guildId },
      select: { id: true, position: true },
      orderBy: [{ position: "asc" }, { id: "asc" }],
    });
    const idx = permits.findIndex((p) => p.id === permitId);
    if (idx === -1) return false;
    const swapWith = direction === "up" ? idx - 1 : idx + 1;
    if (swapWith < 0 || swapWith >= permits.length) return true;
    const a = permits[idx]!;
    const b = permits[swapWith]!;
    await this.prisma.$transaction([
      this.prisma.permit.update({ where: { id: a.id }, data: { position: b.position } }),
      this.prisma.permit.update({ where: { id: b.id }, data: { position: a.position } }),
    ]);
    return true;
  }

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
    await this.db.ensureGuild(guildId);
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
    assignments?: Array<{
      guildId: string;
      targetType: string;
      targetId: string;
    }>,
  ): Promise<void> {
    if (!assignments || assignments.length === 0) return;
    const keys = assignments.map((a) =>
      CacheKeys.targetPermits(
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
      CacheKeys.targetPermits(permit.guildId, targetType, targetId),
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
      CacheKeys.targetPermits(permit.guildId, targetType, targetId),
    );
    return count;
  }
}

function collapseAssignments(
  assignments: Array<{
    permit: { kind: string; polarity: string; nodes: string[]; position: number };
  }>,
): TargetPermitPayload {
  const custom: PolarityBucket = { grant: [], deny: [] };
  const enforced: PolarityBucket = { grant: [], deny: [] };
  const ordered = [...assignments].sort((a, b) => a.permit.position - b.permit.position);
  for (const { permit } of ordered) {
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
