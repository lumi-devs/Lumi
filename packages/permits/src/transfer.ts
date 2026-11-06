import { Prisma, type PrismaClient } from "@prisma/client";
import { createAuditLog } from "./audit.js";
import { isWhitelistScope, MinCustomPermitNumber } from "./constants.js";
import { nextCustomPermitNumber } from "./numbering.js";
import type { PermitTargetType, Polarity } from "./types.js";

export interface ExportedPermit {
  readonly id: number;
  readonly guildId: string;
  readonly name: string;
  readonly number: number;
  readonly nodes: readonly string[];
  readonly polarity: Polarity;
  readonly position: number;
  readonly builtin: boolean;
  readonly expiresAt: string | null;
  readonly schedule: unknown;
  readonly timezone: string | null;
  readonly conditions: unknown;
  readonly whitelistScopes?: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ExportedAssignment {
  readonly id: number;
  readonly permitId: number;
  readonly guildId: string;
  readonly targetType: PermitTargetType;
  readonly targetId: string;
  readonly grantedBy: string;
  readonly grantedAt?: string;
  readonly expiresAt: string | null;
}

export interface PermitExportData {
  readonly permits: readonly ExportedPermit[];
  readonly assignments: readonly ExportedAssignment[];
  readonly version: number;
  readonly exportedAt: string;
  readonly guildId: string;
}

export interface PermitImportOptions {
  readonly overwriteExisting?: boolean;
  readonly skipBuiltins?: boolean;

  readonly userId?: string;

  readonly allowOwnerNodes?: boolean;
}

export interface PermitImportResult {
  readonly imported: number;
  readonly skipped: number;
  readonly errors: readonly string[];
}

const TargetTypes: ReadonlySet<string> = new Set(["USER", "ROLE", "CHANNEL"]);

function isPermitTargetType(value: unknown): value is PermitTargetType {
  return typeof value === "string" && TargetTypes.has(value);
}

function toDate(value: unknown): Date | null | undefined {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function toJsonInput(
  value: unknown,
): Prisma.InputJsonValue | typeof Prisma.DbNull {
  if (value === null || value === undefined) return Prisma.DbNull;
  return value as Prisma.InputJsonValue;
}

export async function exportPermits(
  db: Pick<PrismaClient, "permit">,
  guildId: string,
): Promise<PermitExportData> {
  const permits = await db.permit.findMany({
    where: { guildId },
    include: { assignments: true },
    orderBy: { position: "asc" },
  });

  const assignments: ExportedAssignment[] = [];
  const exported: ExportedPermit[] = [];

  for (const permit of permits) {
    exported.push({
      id: permit.id,
      guildId: permit.guildId,
      name: permit.name,
      number: permit.number,
      nodes: permit.nodes,
      polarity: permit.polarity,
      position: permit.position,
      builtin: permit.builtin,
      expiresAt: permit.expiresAt?.toISOString() ?? null,
      schedule: permit.schedule,
      timezone: permit.timezone,
      conditions: permit.conditions,
      whitelistScopes: permit.whitelistScopes,
      createdAt: permit.createdAt.toISOString(),
      updatedAt: permit.updatedAt.toISOString(),
    });

    for (const assignment of permit.assignments) {
      assignments.push({
        id: assignment.id,
        permitId: assignment.permitId,
        guildId: assignment.guildId,
        targetType: assignment.targetType,
        targetId: assignment.targetId,
        grantedBy: assignment.grantedBy,
        grantedAt: assignment.grantedAt.toISOString(),
        expiresAt: assignment.expiresAt?.toISOString() ?? null,
      });
    }
  }

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    guildId,
    permits: exported,
    assignments,
  };
}

/**
 * Imports permits into one guild.
 *
 * Import data is treated as untrusted: malformed records are reported through
 * `errors` instead of being written or thrown. Imported permits are always
 * custom (the exported `builtin` flag is ignored), and owner-level `*` nodes are
 * rejected unless a trusted caller explicitly passes `allowOwnerNodes`.
 */
export async function importPermits(
  db: PrismaClient,
  guildId: string,
  data: PermitExportData,
  options: PermitImportOptions = {},
): Promise<PermitImportResult> {
  const overwriteExisting = options.overwriteExisting ?? false;
  const skipBuiltins = options.skipBuiltins ?? true;
  const allowOwnerNodes = options.allowOwnerNodes ?? false;
  const userId = options.userId ?? "unknown";
  const result = { imported: 0, skipped: 0, errors: [] as string[] };

  const payload = data as unknown;
  if (payload === null || typeof payload !== "object") {
    result.errors.push("Invalid import data");
    return result;
  }
  if (data.guildId !== guildId) {
    result.errors.push("Guild ID mismatch in import data");
    return result;
  }
  if (typeof data.version !== "number" || !Number.isInteger(data.version)) {
    result.errors.push(`Unsupported export version: ${String(data.version)}`);
    return result;
  }
  if (data.version > 1) {
    result.errors.push(`Unsupported export version: ${data.version}`);
    return result;
  }

  if (!Array.isArray(data.permits) || !Array.isArray(data.assignments)) {
    result.errors.push(
      "Invalid import data: permits and assignments must be arrays",
    );
    return result;
  }

  const assignmentsByPermit = new Map<number, ExportedAssignment[]>();
  for (const assignment of data.assignments) {
    if (
      !assignment ||
      typeof assignment !== "object" ||
      typeof assignment.permitId !== "number" ||
      !Number.isInteger(assignment.permitId)
    ) {
      result.errors.push("Skipped invalid assignment record");
      continue;
    }
    const list = assignmentsByPermit.get(assignment.permitId);
    if (list) list.push(assignment);
    else assignmentsByPermit.set(assignment.permitId, [assignment]);
  }

  for (const permitData of data.permits) {
    if (!permitData || typeof permitData !== "object") {
      result.errors.push("Failed to import permit: invalid entry");
      continue;
    }
    if (skipBuiltins && permitData.builtin) {
      result.skipped++;
      continue;
    }

    if (
      typeof permitData.name !== "string" ||
      permitData.name.trim().length === 0
    ) {
      result.errors.push("Failed to import permit: invalid name");
      continue;
    }
    const rawNodes: unknown = permitData.nodes;
    if (!Array.isArray(rawNodes)) {
      result.errors.push(
        `Failed to import permit ${permitData.name}: invalid permission nodes`,
      );
      continue;
    }
    const nodes = rawNodes.filter(
      (node): node is string => typeof node === "string",
    );
    if (
      nodes.length === 0 ||
      nodes.length !== rawNodes.length ||
      nodes.some((node) => node.trim().length === 0)
    ) {
      result.errors.push(
        `Failed to import permit ${permitData.name}: invalid permission nodes`,
      );
      continue;
    }
    if (!allowOwnerNodes && nodes.includes("*")) {
      result.errors.push(
        `Failed to import permit ${permitData.name}: owner-level nodes are not allowed`,
      );
      continue;
    }
    if (permitData.polarity !== "Grant" && permitData.polarity !== "Deny") {
      result.errors.push(
        `Failed to import permit ${permitData.name}: invalid polarity`,
      );
      continue;
    }
    const rawScopes: unknown = permitData.whitelistScopes;
    if (
      rawScopes !== undefined &&
      rawScopes !== null &&
      !Array.isArray(rawScopes)
    ) {
      result.errors.push(
        `Failed to import permit ${permitData.name}: invalid whitelist scope`,
      );
      continue;
    }
    const whitelistScopes = Array.isArray(rawScopes)
      ? rawScopes.filter((scope): scope is string => typeof scope === "string")
      : [];
    if (
      (Array.isArray(rawScopes) &&
        whitelistScopes.length !== rawScopes.length) ||
      whitelistScopes.some((scope) => !isWhitelistScope(scope))
    ) {
      result.errors.push(
        `Failed to import permit ${permitData.name}: invalid whitelist scope`,
      );
      continue;
    }
    if (
      permitData.position !== undefined &&
      (typeof permitData.position !== "number" ||
        !Number.isFinite(permitData.position) ||
        !Number.isInteger(permitData.position))
    ) {
      result.errors.push(
        `Failed to import permit ${permitData.name}: invalid position`,
      );
      continue;
    }
    if (
      permitData.timezone !== null &&
      permitData.timezone !== undefined &&
      typeof permitData.timezone !== "string"
    ) {
      result.errors.push(
        `Failed to import permit ${permitData.name}: invalid timezone`,
      );
      continue;
    }
    const expiresAt = toDate(permitData.expiresAt);
    if (expiresAt === undefined) {
      result.errors.push(
        `Failed to import permit ${permitData.name}: invalid expiry`,
      );
      continue;
    }
    const createdAtValue = toDate(permitData.createdAt);
    const updatedAtValue = toDate(permitData.updatedAt);
    if (createdAtValue === undefined || updatedAtValue === undefined) {
      result.errors.push(
        `Failed to import permit ${permitData.name}: invalid timestamp`,
      );
      continue;
    }
    const createdAt = createdAtValue ?? new Date();
    const updatedAt = updatedAtValue ?? createdAt;
    const position =
      typeof permitData.position === "number" ? permitData.position : 0;

    const rawAssignments = assignmentsByPermit.get(permitData.id) ?? [];
    const assignments: {
      targetType: PermitTargetType;
      targetId: string;
      grantedBy: string;
      expiresAt: Date | null;
      grantedAt: Date | undefined;
    }[] = [];
    let assignmentError: string | null = null;
    for (const assignment of rawAssignments) {
      if (
        !assignment ||
        typeof assignment !== "object" ||
        !isPermitTargetType(assignment.targetType) ||
        typeof assignment.targetId !== "string" ||
        assignment.targetId.length === 0 ||
        typeof assignment.grantedBy !== "string" ||
        assignment.grantedBy.length === 0
      ) {
        assignmentError = "invalid assignment target";
        break;
      }
      const grantedAt = toDate(assignment.grantedAt);
      const assignmentExpiresAt = toDate(assignment.expiresAt);
      if (grantedAt === undefined || assignmentExpiresAt === undefined) {
        assignmentError = "invalid assignment timestamp";
        break;
      }
      assignments.push({
        targetType: assignment.targetType,
        targetId: assignment.targetId,
        grantedBy: assignment.grantedBy,
        expiresAt: assignmentExpiresAt,
        grantedAt: grantedAt ?? undefined,
      });
    }
    if (assignmentError !== null) {
      result.errors.push(
        `Failed to import permit ${permitData.name}: ${assignmentError}`,
      );
      continue;
    }

    let imported = false;
    try {
      await db.$transaction(async (tx) => {
        const existing = await tx.permit.findUnique({
          where: { guildId_name: { guildId, name: permitData.name } },
          select: { id: true },
        });

        if (existing && !overwriteExisting) {
          result.skipped++;
          return;
        }
        if (existing) {
          await tx.permit.delete({ where: { id: existing.id } });
        }

        const number =
          typeof permitData.number === "number" &&
          permitData.number >= MinCustomPermitNumber
            ? permitData.number
            : await nextCustomPermitNumber(tx, guildId);

        const permit = await tx.permit.create({
          data: {
            guildId,
            name: permitData.name,
            number,
            nodes,
            polarity: permitData.polarity,
            position,
            builtin: false,
            expiresAt,
            schedule: toJsonInput(permitData.schedule),
            timezone: permitData.timezone,
            conditions: toJsonInput(permitData.conditions),
            whitelistScopes,
            createdAt,
            updatedAt,
          },
        });

        if (assignments.length > 0) {
          await tx.permitAssignment.createMany({
            data: assignments.map((assignment) => ({
              permitId: permit.id,
              guildId,
              targetType: assignment.targetType,
              targetId: assignment.targetId,
              grantedBy: assignment.grantedBy,
              expiresAt: assignment.expiresAt,
              grantedAt: assignment.grantedAt,
            })),
          });
        }

        await createAuditLog(tx, {
          guildId,
          userId,
          action: "PERMIT_IMPORT",
          targetId: permit.id.toString(),
          targetType: "PERMIT",
          changes: {
            name: permit.name,
            nodes: permit.nodes,
            polarity: permit.polarity,
          },
        });

        imported = true;
      });

      if (imported) result.imported++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.errors.push(
        `Failed to import permit ${permitData.name}: ${message}`,
      );
    }
  }

  return result;
}
