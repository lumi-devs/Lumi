import { Service } from "#lib/module-system/Service.js";
import { cleanMention } from "#utilities/misc.js";
import { ApplyOptions } from "@sapphire/decorators";
import type { Piece } from "@sapphire/framework";

@ApplyOptions<Piece.Options>({ name: "permissions" })
export class PermissionService extends Service {
  public parseTarget(raw: string | null, type: string): string {
    if (type === "everyone") return "0";
    if (!raw) throw new Error("Target is required for non-everyone overrides.");
    const cleaned = cleanMention(raw);
    if (!/^\d{17,20}$/.test(cleaned))
      throw new Error("Invalid mention or snowflake ID.");
    return cleaned;
  }

  public async grantCustomPermit(
    guildId: string,
    targetType: "user" | "role",
    targetRaw: string,
    permit: string,
  ) {
    const targetId = this.parseTarget(targetRaw, targetType);
    await this.container.db.permissions.grantCustomPermit(
      guildId,
      targetType,
      targetId,
      permit,
    );
    return targetId;
  }

  public async revokeCustomPermit(
    guildId: string,
    targetType: "user" | "role",
    targetRaw: string,
    permit: string,
  ) {
    const targetId = this.parseTarget(targetRaw, targetType);
    return this.container.db.permissions.revokeCustomPermit(
      guildId,
      targetType,
      targetId,
      permit,
    );
  }

  public async grantEnforcedPermit(
    guildId: string,
    targetType: "user" | "role",
    targetRaw: string,
    permit: string,
  ) {
    const targetId = this.parseTarget(targetRaw, targetType);
    await this.container.db.permissions.grantEnforcedPermit(
      guildId,
      targetType,
      targetId,
      permit,
    );
    return targetId;
  }

  public async revokeEnforcedPermit(
    guildId: string,
    targetType: "user" | "role",
    targetRaw: string,
    permit: string,
  ) {
    const targetId = this.parseTarget(targetRaw, targetType);
    return this.container.db.permissions.revokeEnforcedPermit(
      guildId,
      targetType,
      targetId,
      permit,
    );
  }

}

declare module "#lib/module-system/Service.js" {
  interface Services {
    permissions: PermissionService;
  }
}
