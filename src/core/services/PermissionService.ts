import { Service } from "#core/module-system/Service.js";
import type { PermissionModelType } from "#lib/permissions.js";
import { ApplyOptions } from "@sapphire/decorators";
import type { Piece } from "@sapphire/framework";

@ApplyOptions<Piece.Options>({ name: "permissions" })
export class PermissionService extends Service {
  public parseTarget(raw: string | null, type: PermissionModelType): string {
    if (type === "everyone") return "0";
    if (!raw) throw new Error("Target is required for non-everyone overrides.");
    const cleaned = raw.replace(/[<@&#!>]/g, "");
    if (!/^\d{1,20}$/.test(cleaned))
      throw new Error("Invalid mention or snowflake ID.");
    return cleaned;
  }

  public async addOverride(
    guildId: string,
    commandPath: string,
    type: PermissionModelType,
    targetRaw: string | null,
    allow: boolean,
  ) {
    const targetId = this.parseTarget(targetRaw, type);
    await this.container.db.setPermissionOverride(
      guildId,
      commandPath,
      type,
      targetId,
      allow,
    );
    return targetId;
  }

  public async resetOverride(
    guildId: string,
    commandPath: string,
    type: PermissionModelType | null,
    targetRaw: string | null,
  ) {
    let deleted: number;
    if (type) {
      const targetId = this.parseTarget(targetRaw, type);
      deleted = await this.container.db.clearPermissionOverrides(
        guildId,
        commandPath,
        type,
        targetId,
      );
    } else {
      deleted = await this.container.db.clearPermissionOverrides(
        guildId,
        commandPath,
      );
    }

    if (deleted === 0) {
      throw new Error("No matching overrides were found.");
    }

    return deleted;
  }
}
