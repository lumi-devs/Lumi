import {
  KIND_TARGET_TYPE,
  type PermitAssignmentRecord,
  type PermitKind,
  type PermitRecord,
  type PermitTargetType,
  type PermitWithAssignments,
} from "#lib/prisma/repositories/PermissionRepository.js";
import { Service } from "#lib/module-system/Service.js";
import { cleanMention } from "#utilities/misc.js";
import { ApplyOptions } from "@sapphire/decorators";
import type { Piece } from "@sapphire/framework";

const VALID_KINDS: ReadonlySet<string> = new Set(["enforced", "custom"]);

@ApplyOptions<Piece.Options>({ name: "permissions" })
export class PermissionService extends Service {
  public listPermits(guildId: string): Promise<PermitWithAssignments[]> {
    return this.container.db.permissions.listPermits(guildId);
  }

  public getPermit(
    guildId: string,
    permitId: number,
  ): Promise<PermitRecord | null> {
    return this.container.db.permissions.getPermit(guildId, permitId);
  }

  public findPermitByName(
    guildId: string,
    name: string,
  ): Promise<PermitRecord | null> {
    return this.container.db.permissions.findPermitByName(guildId, name.trim());
  }

  public async createPermit(
    guildId: string,
    name: string,
    kind: string,
    nodes: string[],
  ): Promise<PermitRecord> {
    if (kind === "enforced") {
      throw new Error(
        "Enforced permits are fixed system tiers (Extra Owner, Trusted Admin) and can't be created. Create a custom permit instead.",
      );
    }
    this.assertValidKind(kind);
    const trimmedName = name.trim();
    if (!trimmedName) throw new Error("A permit name is required.");
    const existing = await this.container.db.permissions.findPermitByName(
      guildId,
      trimmedName,
    );
    if (existing) {
      throw new Error(`A permit named "${trimmedName}" already exists.`);
    }
    return this.container.db.permissions.createPermit(
      guildId,
      trimmedName,
      kind,
      this.normalizeNodes(nodes),
    );
  }

  public async renamePermit(
    guildId: string,
    permitId: number,
    name: string,
  ): Promise<PermitRecord> {
    const trimmedName = name.trim();
    if (!trimmedName) throw new Error("A permit name is required.");
    await this.requirePermit(guildId, permitId);
    const existing = await this.container.db.permissions.findPermitByName(
      guildId,
      trimmedName,
    );
    if (existing && existing.id !== permitId) {
      throw new Error(`A permit named "${trimmedName}" already exists.`);
    }
    const renamed = await this.container.db.permissions.renamePermit(
      guildId,
      permitId,
      trimmedName,
    );
    if (!renamed) throw new Error("Permit not found.");
    return renamed;
  }

  public async updatePermitNodes(
    guildId: string,
    permitId: number,
    nodes: string[],
  ): Promise<PermitRecord> {
    const updated = await this.container.db.permissions.updatePermitNodes(
      guildId,
      permitId,
      this.normalizeNodes(nodes),
    );
    if (!updated) throw new Error("Permit not found.");
    return updated;
  }

  public async deletePermit(guildId: string, permitId: number): Promise<void> {
    const permit = await this.requirePermit(guildId, permitId);
    if (permit.builtin) {
      throw new Error("Built-in permits cannot be deleted.");
    }
    await this.container.db.permissions.deletePermit(guildId, permitId);
  }

  public async assignPermit(
    guildId: string,
    permitId: number,
    targetType: PermitTargetType,
    targetRaw: string,
  ): Promise<PermitAssignmentRecord> {
    const permit = await this.requirePermit(guildId, permitId);
    this.assertTargetTypeMatches(permit, targetType);
    const targetId = this.parseTargetId(targetRaw);
    return this.container.db.permissions.assignPermit(
      guildId,
      permitId,
      targetId,
    );
  }

  public async unassignPermit(
    guildId: string,
    permitId: number,
    targetType: PermitTargetType,
    targetRaw: string,
  ): Promise<number> {
    const permit = await this.requirePermit(guildId, permitId);
    this.assertTargetTypeMatches(permit, targetType);
    const targetId = this.parseTargetId(targetRaw);
    return this.container.db.permissions.unassignPermit(
      guildId,
      permitId,
      targetId,
    );
  }

  private async requirePermit(
    guildId: string,
    permitId: number,
  ): Promise<PermitRecord> {
    const permit = await this.container.db.permissions.getPermit(
      guildId,
      permitId,
    );
    if (!permit) throw new Error("Permit not found.");
    return permit;
  }

  private assertTargetTypeMatches(
    permit: PermitRecord,
    targetType: PermitTargetType,
  ): void {
    const expected = KIND_TARGET_TYPE[permit.kind as PermitKind];
    if (expected !== targetType) {
      throw new Error(
        permit.kind === "enforced"
          ? "Enforced permits can only be assigned to users, not roles."
          : "Custom permits can only be assigned to roles, not users.",
      );
    }
  }

  private parseTargetId(raw: string): string {
    const cleaned = cleanMention(raw);
    if (!/^\d{17,20}$/.test(cleaned)) {
      throw new Error("Invalid mention or snowflake ID.");
    }
    return cleaned;
  }

  private normalizeNodes(nodes: string[]): string[] {
    const cleaned = [...new Set(nodes.map((n) => n.trim()).filter(Boolean))];
    if (cleaned.length === 0) {
      throw new Error("At least one permit node is required.");
    }
    return cleaned;
  }

  private assertValidKind(kind: string): asserts kind is PermitKind {
    if (!VALID_KINDS.has(kind)) {
      throw new Error(`Invalid permit kind "${kind}".`);
    }
  }
}

declare module "#lib/module-system/Service.js" {
  interface Services {
    permissions: PermissionService;
  }
}
