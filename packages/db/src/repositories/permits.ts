import type { Permit, PermitAssignment } from "../../generated/client/index.js";
import { Repository, type RepositoryDeps } from "./base.ts";

export type PermitKind = "enforced" | "custom";
export type PermitPolarity = "grant" | "deny";
export type PermitTargetType = "user" | "role" | "channel";

export interface TargetPermitPayload {
  custom: { grant: string[]; deny: string[] };
  enforced: { grant: string[]; deny: string[] };
}

export interface PermitWithAssignments extends Permit {
  assignments: PermitAssignment[];
}

const BuiltinPermits = [
  { name: "Extra Owner", kind: "enforced", polarity: "grant", nodes: ["*"], position: 0 },
  { name: "Trusted Admin", kind: "enforced", polarity: "grant", nodes: ["admin.*"], position: 1 },
] as const;

export class PermitRepository extends Repository {
  public constructor(deps: RepositoryDeps) {
    super(deps);
  }

  #permitCacheKey(guildId: string, targetType: string, targetId: string): string {
    return this.deps.keys.permits(guildId, targetType, targetId);
  }

  public async ensureBuiltinPermits(guildId: string): Promise<void> {
    await this.prisma.$transaction(
      BuiltinPermits.map((builtin) =>
        this.prisma.permit.upsert({
          where: { uq_permit_guild_name: { guildId, name: builtin.name } },
          update: {},
          create: {
            guildId,
            name: builtin.name,
            kind: builtin.kind,
            polarity: builtin.polarity,
            nodes: [...builtin.nodes],
            builtin: true,
            position: builtin.position,
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

  public async getPermit(guildId: string, permitId: number): Promise<PermitWithAssignments | null> {
    return this.prisma.permit.findFirst({
      where: { id: permitId, guildId },
      include: { assignments: true },
    });
  }

  public async findPermitByNameOrId(guildId: string, input: string): Promise<PermitWithAssignments | null> {
    const asNum = Number(input);
    if (!Number.isNaN(asNum) && Number.isInteger(asNum)) {
      const byId = await this.getPermit(guildId, asNum);
      if (byId) return byId;
    }
    return this.prisma.permit.findFirst({
      where: { guildId, name: { equals: input, mode: "insensitive" } },
      include: { assignments: true },
    });
  }

  public async createPermit(
    guildId: string,
    data: {
      name: string;
      kind?: PermitKind;
      polarity?: PermitPolarity;
      nodes: string[];
    },
  ): Promise<Permit> {
    const highest = await this.prisma.permit.findFirst({
      where: { guildId },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    const position = (highest?.position ?? -1) + 1;

    return this.prisma.permit.create({
      data: {
        guildId,
        name: data.name.trim(),
        kind: data.kind ?? "custom",
        polarity: data.polarity ?? "grant",
        nodes: data.nodes.map((n) => n.trim().toLowerCase()).filter(Boolean),
        position,
        builtin: false,
      },
    });
  }

  public async updatePermit(
    guildId: string,
    permitId: number,
    data: {
      name?: string;
      nodes?: string[];
      polarity?: PermitPolarity;
    },
  ): Promise<Permit | null> {
    const permit = await this.prisma.permit.findFirst({
      where: { id: permitId, guildId },
      include: { assignments: true },
    });
    if (!permit) return null;

    const updated = await this.prisma.permit.update({
      where: { id: permitId },
      data: {
        ...(data.name ? { name: data.name.trim() } : {}),
        ...(data.nodes ? { nodes: data.nodes.map((n) => n.trim().toLowerCase()).filter(Boolean) } : {}),
        ...(data.polarity ? { polarity: data.polarity } : {}),
      },
    });

    await this.invalidateAssignments(permit.assignments);
    return updated;
  }

  public async deletePermit(guildId: string, permitId: number): Promise<boolean> {
    const permit = await this.prisma.permit.findFirst({
      where: { id: permitId, guildId },
      include: { assignments: true },
    });
    if (!permit || permit.builtin) return false;

    await this.prisma.permit.delete({ where: { id: permitId } });
    await this.invalidateAssignments(permit.assignments);
    await this.normalizePositions(guildId);
    return true;
  }

  public async assignPermit(
    guildId: string,
    permitId: number,
    targetType: PermitTargetType,
    targetId: string,
  ): Promise<PermitAssignment> {
    const permit = await this.prisma.permit.findFirst({ where: { id: permitId, guildId } });
    if (!permit) throw new Error("Permit not found.");

    const assignment = await this.prisma.permitAssignment.upsert({
      where: {
        uq_permit_assignment: { permitId, targetType, targetId },
      },
      update: {},
      create: {
        permitId,
        guildId,
        targetType,
        targetId,
      },
    });

    await this.invalidate(this.#permitCacheKey(guildId, targetType, targetId));
    return assignment;
  }

  public async unassignPermit(
    guildId: string,
    permitId: number,
    targetType: PermitTargetType,
    targetId: string,
  ): Promise<boolean> {
    const permit = await this.prisma.permit.findFirst({ where: { id: permitId, guildId } });
    if (!permit) return false;

    const result = await this.prisma.permitAssignment.deleteMany({
      where: { permitId, guildId, targetType, targetId },
    });

    if (result.count > 0) {
      await this.invalidate(this.#permitCacheKey(guildId, targetType, targetId));
      return true;
    }
    return false;
  }

  public async normalizePositions(guildId: string): Promise<void> {
    const permits = await this.prisma.permit.findMany({
      where: { guildId },
      select: { id: true, position: true },
      orderBy: [{ position: "asc" }, { builtin: "desc" }, { id: "asc" }],
    });

    const updates = permits.flatMap((p, i) =>
      p.position === i ? [] : [this.prisma.permit.update({ where: { id: p.id }, data: { position: i } })],
    );

    if (updates.length > 0) {
      await this.prisma.$transaction(updates);
    }
  }

  public async movePermit(guildId: string, permitId: number, direction: "up" | "down"): Promise<boolean> {
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

    const current = permits[idx]!;
    const adjacent = permits[swapWith]!;

    await this.prisma.$transaction([
      this.prisma.permit.update({ where: { id: current.id }, data: { position: adjacent.position } }),
      this.prisma.permit.update({ where: { id: adjacent.id }, data: { position: current.position } }),
    ]);

    return true;
  }

  public async reorderPermits(guildId: string, orderedPermitIds: number[]): Promise<void> {
    const existing = await this.prisma.permit.findMany({
      where: { guildId },
      select: { id: true },
    });
    const validIds = new Set(existing.map((e) => e.id));

    const updates: Array<ReturnType<typeof this.prisma.permit.update>> = [];
    let pos = 0;
    for (const id of orderedPermitIds) {
      if (validIds.has(id)) {
        updates.push(this.prisma.permit.update({ where: { id }, data: { position: pos++ } }));
        validIds.delete(id);
      }
    }
    for (const remainingId of validIds) {
      updates.push(this.prisma.permit.update({ where: { id: remainingId }, data: { position: pos++ } }));
    }

    if (updates.length > 0) {
      await this.prisma.$transaction(updates);
    }
  }

  public async getPermitChain(
    guildId: string,
    targets: Array<{ targetType: PermitTargetType; targetId: string }>,
  ): Promise<TargetPermitPayload[]> {
    const results: TargetPermitPayload[] = [];

    for (const target of targets) {
      const cacheKey = this.#permitCacheKey(guildId, target.targetType, target.targetId);
      const cached = await this.deps.redis.get(cacheKey).catch(() => null);

      if (cached) {
        try {
          results.push(JSON.parse(cached));
          continue;
        } catch {
          // parse error, recompute
        }
      }

      const assignments = await this.prisma.permitAssignment.findMany({
        where: {
          guildId,
          targetType: target.targetType,
          targetId: target.targetId,
        },
        include: { permit: true },
      });

      const payload = collapseAssignments(assignments);
      await this.deps.redis.set(cacheKey, JSON.stringify(payload), "EX", 300).catch(() => undefined);
      results.push(payload);
    }

    return results;
  }

  private async invalidateAssignments(
    assignments?: Array<{
      guildId: string;
      targetType: string;
      targetId: string;
    }>,
  ): Promise<void> {
    if (!assignments || assignments.length === 0) return;
    const keys = assignments.map((a) => this.#permitCacheKey(a.guildId, a.targetType, a.targetId));
    await this.invalidate(...keys);
  }
}

function collapseAssignments(
  assignments: Array<{
    permit: { kind: string; polarity: string; nodes: string[]; position: number };
  }>,
): TargetPermitPayload {
  const custom = { grant: [] as string[], deny: [] as string[] };
  const enforced = { grant: [] as string[], deny: [] as string[] };

  const ordered = [...assignments].sort((a, b) => a.permit.position - b.permit.position);
  for (const { permit } of ordered) {
    const kindBucket = permit.kind === "enforced" ? enforced : custom;
    const polarityBucket = permit.polarity === "deny" ? kindBucket.deny : kindBucket.grant;
    polarityBucket.push(...permit.nodes);
  }

  return { custom, enforced };
}
