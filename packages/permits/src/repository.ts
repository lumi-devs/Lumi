import { createKeys } from "@lumi/redis";
import { Prisma, type PrismaClient } from "@prisma/client";
import type { Client } from "discord.js";
import type Redis from "ioredis";
import type {
  PermitAuditLogEntry,
  PermitAuditLogInput,
  PermitAuditLogQuery,
} from "./audit.js";
import { createAuditLog, getAuditLogs } from "./audit.js";
import {
  buildPermitChain,
  evaluateNodeMatch,
  evaluatePermit,
  evaluatePermitWithChain,
  isPermitValid,
  matchesConditions,
} from "./evaluator.js";
import {
  BuiltinPermitNames,
  BuiltinPermits,
  matchesWhitelistScope,
} from "./constants.js";
import {
  isPermitNumberConflict,
  isRecordNotFoundError,
  isUniqueConstraintError,
  nextCustomPermitNumber,
} from "./numbering.js";
import type {
  PermitExportData,
  PermitImportOptions,
  PermitImportResult,
} from "./transfer.js";
import { exportPermits, importPermits } from "./transfer.js";
import type {
  EvaluatedPermit,
  EvaluatePermitOptions,
  PermitAssignment,
  PermitChainResult,
  PermitChainTarget,
  PermitConditions,
  PermitTargetType,
  PermitWithAssignments,
  Polarity,
} from "./types.js";

export type { PermitAuditLogEntry } from "./audit.js";
export type { PermitExportData } from "./transfer.js";

const keys = createKeys();

function isQuarantinedValue(value: string | null): boolean {
  return value !== null && value !== "0";
}

function targetKey(target: PermitChainTarget): string {
  return `${target.targetType}:${target.targetId}`;
}

export class PermitRepository {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly redis: Redis,
  ) {}

  async listPermits(guildId: string): Promise<PermitWithAssignments[]> {
    return this.prisma.permit.findMany({
      where: { guildId },
      orderBy: { position: "asc" },
      include: { assignments: true },
    });
  }

  async getPermit(
    guildId: string,
    permitId: number,
  ): Promise<PermitWithAssignments | null> {
    return this.prisma.permit.findFirst({
      where: { id: permitId, guildId },
      include: { assignments: true },
    });
  }

  async createPermit(data: {
    guildId: string;
    name: string;
    nodes: readonly string[];
    polarity: Polarity;
    position: number;
    number?: number;
    builtin?: boolean;
    expiresAt?: Date | null;
    schedule?: Prisma.InputJsonValue | null;
    timezone?: string | null;
    conditions?: Prisma.InputJsonValue | null;
    whitelistScopes?: readonly string[];
  }): Promise<PermitWithAssignments> {
    const nodes = Array.from(
      new Set(data.nodes.map((node) => node.trim()).filter(Boolean)),
    );
    if (nodes.length === 0) {
      throw new Error("A permit needs at least one node.");
    }
    const whitelistScopes = Array.from(
      new Set(
        (data.whitelistScopes ?? [])
          .map((scope) => scope.trim())
          .filter(Boolean),
      ),
    );
    const payload = {
      guildId: data.guildId,
      name: data.name,
      nodes,
      polarity: data.polarity,
      position: data.position,
      builtin: data.builtin ?? false,
      expiresAt: data.expiresAt ?? null,
      schedule: data.schedule ?? Prisma.DbNull,
      timezone: data.timezone ?? null,
      conditions: data.conditions ?? Prisma.DbNull,
      whitelistScopes,
    };
    if (data.builtin && data.number === undefined) {
      throw new Error("Built-in permits require a fixed number.");
    }
    if (data.number !== undefined) {
      return this.prisma.permit.create({
        data: { ...payload, number: data.number },
        include: { assignments: true },
      });
    }
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const number = await nextCustomPermitNumber(this.prisma, data.guildId);
      try {
        return await this.prisma.permit.create({
          data: { ...payload, number },
          include: { assignments: true },
        });
      } catch (error) {
        if (!isPermitNumberConflict(error)) throw error;
      }
    }
    throw new Error("Could not allocate a permit number.");
  }

  async updatePermit(
    permitId: number,
    data: Prisma.PermitUpdateInput,
  ): Promise<PermitWithAssignments | null> {
    try {
      return await this.prisma.permit.update({
        where: { id: permitId },
        data,
        include: { assignments: true },
      });
    } catch (error) {
      if (isRecordNotFoundError(error)) return null;
      throw error;
    }
  }

  async deletePermit(permitId: number): Promise<boolean> {
    const permit = await this.prisma.permit.findUnique({
      where: { id: permitId },
      select: { builtin: true },
    });
    if (permit?.builtin) return false;
    try {
      await this.prisma.permit.delete({ where: { id: permitId } });
      return true;
    } catch (error) {
      if (isRecordNotFoundError(error)) return false;
      throw error;
    }
  }

  async movePermit(
    guildId: string,
    permitId: number,
    direction: "up" | "down",
  ): Promise<boolean> {
    const permit = await this.prisma.permit.findFirst({
      where: { id: permitId, guildId },
    });
    if (!permit || permit.builtin) return false;

    const adjacent = await this.prisma.permit.findFirst({
      where: {
        guildId,
        builtin: false,
        position:
          direction === "up"
            ? { lt: permit.position }
            : { gt: permit.position },
      },
      orderBy: { position: direction === "up" ? "desc" : "asc" },
    });

    if (!adjacent) return false;

    await this.prisma.$transaction(async (tx) => {
      await tx.permit.update({
        where: { id: permitId },
        data: { position: adjacent.position },
      });
      await tx.permit.update({
        where: { id: adjacent.id },
        data: { position: permit.position },
      });
    });

    return true;
  }

  async assignPermit(
    permitId: number,
    targetType: PermitTargetType,
    targetId: string,
    grantedBy: string,
    expiresAt?: Date | null,
  ): Promise<PermitAssignment> {
    const permit = await this.prisma.permit.findUnique({
      where: { id: permitId },
      select: { guildId: true, builtin: true },
    });
    if (!permit) throw new Error("Permit not found");
    if (permit.builtin && targetType !== "USER") {
      throw new Error("Built-in permits only accept user assignments.");
    }
    return this.prisma.permitAssignment.create({
      data: {
        permitId,
        guildId: permit.guildId,
        targetType,
        targetId,
        grantedBy,
        expiresAt: expiresAt ?? null,
      },
    });
  }

  async unassignPermit(
    permitId: number,
    targetType: PermitTargetType,
    targetId: string,
  ): Promise<boolean> {
    try {
      await this.prisma.permitAssignment.delete({
        where: {
          permitId_targetType_targetId: {
            permitId,
            targetType,
            targetId,
          },
        },
      });
      return true;
    } catch (error) {
      if (isRecordNotFoundError(error)) return false;
      throw error;
    }
  }

  async getPermitChain(
    guildId: string,
    userId: string,
    chain: readonly PermitChainTarget[],
  ): Promise<PermitChainResult> {
    const at = new Date();
    const assignmentFilter = chain.map(({ targetType, targetId }) => ({
      targetType,
      targetId,
    }));
    const activeAssignment = {
      AND: [
        { OR: assignmentFilter },
        { OR: [{ expiresAt: null }, { expiresAt: { gte: at } }] },
      ],
    };

    const [permits, quarantineValue] = await Promise.all([
      this.prisma.permit.findMany({
        where: {
          guildId,
          OR: [{ expiresAt: null }, { expiresAt: { gte: at } }],
          assignments: { some: activeAssignment },
        },
        select: {
          nodes: true,
          polarity: true,
          expiresAt: true,
          schedule: true,
          timezone: true,
          conditions: true,
          whitelistScopes: true,
          assignments: {
            where: activeAssignment,
            select: { targetType: true, targetId: true },
          },
        },
        orderBy: { position: "asc" },
      }),
      this.redis.get(keys.quarantine(guildId, userId)),
    ]);

    const isQuarantined = isQuarantinedValue(quarantineValue);

    let channelId: string | undefined;
    const roleIds: string[] = [];
    for (const target of chain) {
      if (target.targetType === "CHANNEL") channelId = target.targetId;
      else if (target.targetType === "ROLE") roleIds.push(target.targetId);
    }

    const conditionContext: EvaluatePermitOptions = {
      guildId,
      userId,
      roleIds,
      channelId,
      permitNode: "",
      at,
    };

    const buckets = new Map<
      string,
      {
        grant: string[];
        deny: string[];
        scopes: string[];
        denyScopes: string[];
      }
    >();
    for (const target of chain) {
      buckets.set(targetKey(target), {
        grant: [],
        deny: [],
        scopes: [],
        denyScopes: [],
      });
    }

    for (const permit of permits) {
      if (!isPermitValid(permit, at)) continue;
      if (permit.conditions !== null) {
        if (
          typeof permit.conditions !== "object" ||
          Array.isArray(permit.conditions)
        ) {
          continue;
        }
        if (
          !matchesConditions(
            permit.conditions as PermitConditions,
            conditionContext,
            permit.timezone ?? undefined,
          )
        ) {
          continue;
        }
      }

      for (const assignment of permit.assignments) {
        const bucket = buckets.get(
          targetKey({
            targetType: assignment.targetType,
            targetId: assignment.targetId,
          }),
        );
        if (!bucket) continue;
        if (permit.polarity === "Grant") {
          bucket.grant.push(...permit.nodes);
          bucket.scopes.push(...(permit.whitelistScopes ?? []));
        } else {
          bucket.deny.push(...permit.nodes);
          bucket.denyScopes.push(...(permit.whitelistScopes ?? []));
        }
      }
    }

    return {
      tiers: chain.map((target) => ({
        custom: buckets.get(targetKey(target)) ?? {
          grant: [],
          deny: [],
          scopes: [],
          denyScopes: [],
        },
      })),
      isQuarantined,
    };
  }

  async hasGrantNode(options: EvaluatePermitOptions): Promise<boolean> {
    const chainResult = await this.getPermitChain(
      options.guildId,
      options.userId,
      buildPermitChain(
        options.userId,
        options.channelId,
        options.roleIds ?? [],
      ),
    );
    if (chainResult.isQuarantined) return false;
    for (const tier of chainResult.tiers) {
      if (
        tier.custom.deny.some((node) =>
          evaluateNodeMatch(node, options.permitNode),
        )
      ) {
        return false;
      }
      if (
        tier.custom.grant.some((node) =>
          evaluateNodeMatch(node, options.permitNode),
        )
      ) {
        return true;
      }
    }
    return false;
  }

  async hasWhitelistScope(
    options: Omit<EvaluatePermitOptions, "permitNode">,
    scope: string,
  ): Promise<boolean> {
    const chainResult = await this.getPermitChain(
      options.guildId,
      options.userId,
      buildPermitChain(
        options.userId,
        options.channelId,
        options.roleIds ?? [],
      ),
    );
    if (chainResult.isQuarantined) return false;
    for (const tier of chainResult.tiers) {
      if (
        (tier.custom.denyScopes ?? []).some((granted) =>
          matchesWhitelistScope(granted, scope),
        )
      ) {
        return false;
      }
      if (
        (tier.custom.scopes ?? []).some((granted) =>
          matchesWhitelistScope(granted, scope),
        )
      ) {
        return true;
      }
    }
    return false;
  }

  async explainPermit(
    options: EvaluatePermitOptions,
    client?: Client,
  ): Promise<EvaluatedPermit> {
    return evaluatePermit(options, { db: { permits: this }, client });
  }

  async explainPermitNodes(
    options: Omit<EvaluatePermitOptions, "permitNode">,
    nodes: readonly string[],
    client?: Client,
  ): Promise<Map<string, EvaluatedPermit>> {
    const results = new Map<string, EvaluatedPermit>();
    if (nodes.length === 0) return results;

    const chainResult = await this.getPermitChain(
      options.guildId,
      options.userId,
      buildPermitChain(
        options.userId,
        options.channelId,
        options.roleIds ?? [],
      ),
    );

    for (const node of nodes) {
      results.set(
        node,
        evaluatePermitWithChain(
          { ...options, permitNode: node },
          chainResult,
          client,
        ),
      );
    }

    return results;
  }

  async seedBuiltinPermits(guildId: string): Promise<void> {
    const existing = await this.prisma.permit.findMany({
      where: { guildId, name: { in: BuiltinPermitNames } },
      select: { id: true, name: true },
    });
    const present = new Map(existing.map((permit) => [permit.name, permit.id]));

    for (const builtin of BuiltinPermits) {
      const existingId = present.get(builtin.name);
      if (existingId !== undefined) {
        await this.prisma.permit
          .update({
            where: { id: existingId },
            data: {
              builtin: true,
              whitelistScopes: [...builtin.whitelistScopes],
            },
          })
          .catch(() => undefined);
        continue;
      }
      try {
        await this.createPermit({
          guildId,
          name: builtin.name,
          nodes: [...builtin.nodes],
          polarity: "Grant",
          position: builtin.position,
          number: builtin.number,
          builtin: true,
          whitelistScopes: [...builtin.whitelistScopes],
        });
      } catch (error) {
        if (!isUniqueConstraintError(error) && !isPermitNumberConflict(error)) {
          throw error;
        }
      }
    }
  }

  async createAuditLog(
    data: PermitAuditLogInput,
  ): Promise<PermitAuditLogEntry> {
    return createAuditLog(this.prisma, data);
  }

  async getAuditLogs(
    guildId: string,
    options: PermitAuditLogQuery = {},
  ): Promise<PermitAuditLogEntry[]> {
    return getAuditLogs(this.prisma, guildId, options);
  }

  async exportPermits(guildId: string): Promise<PermitExportData> {
    return exportPermits(this.prisma, guildId);
  }

  async importPermits(
    guildId: string,
    data: PermitExportData,
    options: PermitImportOptions = {},
  ): Promise<PermitImportResult> {
    return importPermits(this.prisma, guildId, data, options);
  }
}
