import { Prisma, type PrismaClient } from "@prisma/client";
import { createAuditLog } from "./audit.js";
import { MinCustomPermitNumber } from "./constants.js";
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

export async function importPermits(
  db: PrismaClient,
  guildId: string,
  data: PermitExportData,
  options: PermitImportOptions = {},
): Promise<PermitImportResult> {
  const overwriteExisting = options.overwriteExisting ?? false;
  const skipBuiltins = options.skipBuiltins ?? true;
  const userId = options.userId ?? "unknown";
  const result = { imported: 0, skipped: 0, errors: [] as string[] };

  if (data.guildId !== guildId) {
    result.errors.push("Guild ID mismatch in import data");
    return result;
  }
  if (data.version > 1) {
    result.errors.push(`Unsupported export version: ${data.version}`);
    return result;
  }

  const assignmentsByPermit = new Map<number, ExportedAssignment[]>();
  for (const assignment of data.assignments) {
    const list = assignmentsByPermit.get(assignment.permitId);
    if (list) list.push(assignment);
    else assignmentsByPermit.set(assignment.permitId, [assignment]);
  }

  for (const permitData of data.permits) {
    if (skipBuiltins && permitData.builtin) {
      result.skipped++;
      continue;
    }

    const assignments = assignmentsByPermit.get(permitData.id) ?? [];
    const invalidTarget = assignments.find(
      (assignment) => !isPermitTargetType(assignment.targetType),
    );
    if (invalidTarget) {
      result.errors.push(
        `Failed to import permit ${permitData.name}: invalid target type ${String(invalidTarget.targetType)}`,
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
            nodes: [...permitData.nodes],
            polarity: permitData.polarity,
            position: permitData.position,
            builtin: permitData.builtin,
            expiresAt: permitData.expiresAt
              ? new Date(permitData.expiresAt)
              : null,
            schedule: toJsonInput(permitData.schedule),
            timezone: permitData.timezone,
            conditions: toJsonInput(permitData.conditions),
            whitelistScopes: Array.isArray(permitData.whitelistScopes)
              ? permitData.whitelistScopes.filter(
                  (scope): scope is string => typeof scope === "string",
                )
              : [],
            createdAt: new Date(permitData.createdAt),
            updatedAt: new Date(permitData.updatedAt),
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
              expiresAt: assignment.expiresAt
                ? new Date(assignment.expiresAt)
                : null,
              grantedAt: assignment.grantedAt
                ? new Date(assignment.grantedAt)
                : undefined,
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
