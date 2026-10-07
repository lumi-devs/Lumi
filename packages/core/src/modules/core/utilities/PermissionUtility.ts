import {
  KindTargetTypes,
  type PermitAssignmentRecord,
  type PermitKind,
  type PermitPolarity,
  type PermitRecord,
  type PermitTargetType,
  type PermitWithAssignments,
} from "#lib/prisma/repositories/PermissionRepository.js";
import { defineUtility } from "#lib/module-system/Utility.js";
import type { Container } from "#lib/services.js";
import { cleanMention, isSnowflakeId } from "#lib/utilities/misc.js";

const ValidKinds: ReadonlySet<string> = new Set(["enforced", "custom"]);

function listPermits(services: Container, guildId: string): Promise<PermitWithAssignments[]> {
  return services.db.permissions.listPermits(guildId);
}

async function createPermit(
  services: Container,
  guildId: string,
  name: string,
  kind: string,
  nodes: string[],
  polarity: PermitPolarity = "grant",
): Promise<PermitRecord> {
  if (kind === "enforced") {
    throw new Error(
      "Enforced permits are fixed system tiers (Extra Owner, Trusted Admin) and can't be created. Create a custom permit instead.",
    );
  }
  assertValidKind(kind);
  const trimmedName = name.trim();
  if (!trimmedName) throw new Error("A permit name is required.");
  const existing = await services.db.permissions.findPermitByName(
    guildId,
    trimmedName,
  );
  if (existing) {
    throw new Error(`A permit named "${trimmedName}" already exists.`);
  }
  return services.db.permissions.createPermit(
    guildId,
    trimmedName,
    kind,
    normalizeNodes(nodes),
    polarity,
  );
}

async function updatePermitNodes(
  services: Container,
  guildId: string,
  permitId: number,
  nodes: string[],
): Promise<PermitRecord> {
  const updated = await services.db.permissions.updatePermitNodes(
    guildId,
    permitId,
    normalizeNodes(nodes),
  );
  if (!updated) throw new Error("Permit not found.");
  return updated;
}

async function requirePermit(
  services: Container,
  guildId: string,
  permitId: number,
): Promise<PermitRecord> {
  const permit = await services.db.permissions.getPermit(
    guildId,
    permitId,
  );
  if (!permit) throw new Error("Permit not found.");
  return permit;
}

function assertTargetTypeMatches(
  permit: PermitRecord,
  targetType: PermitTargetType,
): void {
  const allowed = KindTargetTypes[permit.kind as PermitKind];
  if (!allowed.includes(targetType)) {
    throw new Error(
      permit.kind === "enforced"
        ? "Enforced permits can only be assigned to users."
        : "Custom permits can only be assigned to a user, role, or channel.",
    );
  }
}

function parseTargetId(raw: string): string {
  const cleaned = cleanMention(raw);
  if (!isSnowflakeId(cleaned)) {
    throw new Error("Invalid mention or snowflake ID.");
  }
  return cleaned;
}

function normalizeNodes(nodes: string[]): string[] {
  const cleaned = [...new Set(nodes.map((n) => n.trim()).filter(Boolean))];
  if (cleaned.length === 0) {
    throw new Error("At least one permit node is required.");
  }
  return cleaned;
}

function assertValidKind(kind: string): asserts kind is PermitKind {
  if (!ValidKinds.has(kind)) {
    throw new Error(`Invalid permit kind "${kind}".`);
  }
}

function parsePermitExport(data: unknown): PermitExportEntry[] {
  if (!data || typeof data !== "object" || !Array.isArray((data as PermitExport).permits)) {
    throw new Error("Not a valid permit export file: expected a `permits` array.");
  }
  const permits = (data as PermitExport).permits;
  return permits
    .filter(
      (p): p is PermitExportEntry =>
        Boolean(p) &&
        typeof p.name === "string" &&
        p.name.trim().length > 0 &&
        Array.isArray(p.nodes) &&
        p.nodes.every((n) => typeof n === "string"),
    )
    .map((p) => ({
      name: p.name.trim(),
      nodes: p.nodes,
      roleIds: Array.isArray(p.roleIds) ? p.roleIds.filter((r) => typeof r === "string") : [],
    }));
}

export const permissionUtility = defineUtility({
  name: "permissions",

  listPermits,
  createPermit,
  updatePermitNodes,

  getPermit(
    services: Container,
    guildId: string,
    permitId: number,
  ): Promise<PermitRecord | null> {
    return services.db.permissions.getPermit(guildId, permitId);
  },

  findPermitByName(
    services: Container,
    guildId: string,
    name: string,
  ): Promise<PermitRecord | null> {
    return services.db.permissions.findPermitByName(guildId, name.trim());
  },

  async renamePermit(
    services: Container,
    guildId: string,
    permitId: number,
    name: string,
  ): Promise<PermitRecord> {
    const trimmedName = name.trim();
    if (!trimmedName) throw new Error("A permit name is required.");
    await requirePermit(services, guildId, permitId);
    const existing = await services.db.permissions.findPermitByName(
      guildId,
      trimmedName,
    );
    if (existing && existing.id !== permitId) {
      throw new Error(`A permit named "${trimmedName}" already exists.`);
    }
    const renamed = await services.db.permissions.renamePermit(
      guildId,
      permitId,
      trimmedName,
    );
    if (!renamed) throw new Error("Permit not found.");
    return renamed;
  },

  async deletePermit(services: Container, guildId: string, permitId: number): Promise<void> {
    const permit = await requirePermit(services, guildId, permitId);
    if (permit.builtin) {
      throw new Error("Built-in permits cannot be deleted.");
    }
    await services.db.permissions.deletePermit(guildId, permitId);
  },

  async assignPermit(
    services: Container,
    guildId: string,
    permitId: number,
    targetType: PermitTargetType,
    targetRaw: string,
  ): Promise<PermitAssignmentRecord> {
    const permit = await requirePermit(services, guildId, permitId);
    assertTargetTypeMatches(permit, targetType);
    const targetId = parseTargetId(targetRaw);
    return services.db.permissions.assignPermit(
      guildId,
      permitId,
      targetType,
      targetId,
    );
  },

  async unassignPermit(
    services: Container,
    guildId: string,
    permitId: number,
    targetType: PermitTargetType,
    targetRaw: string,
  ): Promise<number> {
    const permit = await requirePermit(services, guildId, permitId);
    assertTargetTypeMatches(permit, targetType);
    const targetId = parseTargetId(targetRaw);
    return services.db.permissions.unassignPermit(
      guildId,
      permitId,
      targetType,
      targetId,
    );
  },

  /**
   * Bulk export of every custom (non-builtin) permit and its role
   * assignments, for backup or copying between guilds. Built-in permits
   * (Extra Owner, Trusted Admin) are excluded - `ensureBuiltinPermits`
   * recreates those in any guild automatically, they don't need transfer.
   */
  async exportPermits(services: Container, guildId: string): Promise<PermitExport> {
    const permits = await listPermits(services, guildId);
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      permits: permits
        .filter((p) => !p.builtin)
        .map((p) => ({
          name: p.name,
          nodes: p.nodes,
          roleIds: p.assignments
            .filter((a) => a.targetType === "role")
            .map((a) => a.targetId),
        })),
    };
  },

  /**
   * Bulk import from `exportPermits`' shape. Additive/merge only: an
   * existing permit with the same name gets its node bundle replaced and
   * new role assignments added, nothing is deleted. Malformed entries are
   * skipped rather than aborting the whole import.
   */
  async importPermits(
    services: Container,
    guildId: string,
    data: unknown,
  ): Promise<PermitImportResult> {
    const entries = parsePermitExport(data);
    const result: PermitImportResult = { created: 0, updated: 0, skipped: [] };

    for (const entry of entries) {
      try {
        let permit = await services.db.permissions.findPermitByName(
          guildId,
          entry.name,
        );
        if (permit) {
          await updatePermitNodes(services, guildId, permit.id, entry.nodes);
          result.updated++;
        } else {
          permit = await createPermit(services, guildId, entry.name, "custom", entry.nodes);
          result.created++;
        }
        const roleIds = entry.roleIds.filter((id) => isSnowflakeId(id));
        await Promise.all(
          roleIds.map((roleId) =>
            services.db.permissions.assignPermit(
              guildId,
              permit.id,
              "role",
              roleId,
            ),
          ),
        );
      } catch (err: unknown) {
        result.skipped.push({
          name: entry.name,
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return result;
  }
});

export type PermissionUtility = typeof permissionUtility;

export interface PermitExportEntry {
  name: string;
  nodes: string[];
  roleIds: string[];
}

export interface PermitExport {
  version: 1;
  exportedAt: string;
  permits: PermitExportEntry[];
}

export interface PermitImportResult {
  created: number;
  updated: number;
  skipped: Array<{ name: string; reason: string }>;
}

declare module "#lib/module-system/Utility.js" {
  interface Utilities {
    permissions: typeof permissionUtility;
  }
}
