import { Module, DefineModule } from "#core/module-system/Module.js";
import type { RequesterType } from "#core/lib/gdpr.js";
import { MODULE_NAME, TempVcData } from "./keys.js";
import { tempVcRegistry } from "./registry.js";
import { registerTaskFireHandler } from "#core/lib/task-fire-registry.js";
import { handleTempVcCleanupFire } from "./lib/cleanup-handler.js";

export const TEMPVC_CREATE_COOLDOWN_MS = 30_000;
export const TEMPVC_CLEANUP_DELAY_MS = 8_000;
export const TEMPVC_MAX_GENERATORS = 25;

@DefineModule({
  name: MODULE_NAME,
  displayName: "Temp Voice Channels",
  emoji: "🔊",
  version: "1.0.0",
  description:
    "On-demand temporary voice channels that delete themselves once empty, with an owner control panel.",
})
export class TempVcModule extends Module {
  public override onLoad() {
    registerTaskFireHandler(
      "tempvc-cleanup",
      "unicast",
      handleTempVcCleanupFire,
    );
    return super.onLoad();
  }

  public override async deleteUserData(
    userId: string,
    _requester: RequesterType,
  ): Promise<void> {
    // Drop ownership records for this user; the channels themselves are
    // cleaned up normally once empty.
    const rows = await this.container.db.guildKV.listModuleData<{
      ownerId?: string;
    }>({
      module: MODULE_NAME,
      key: TempVcData.RECORD,
    });
    const owned = rows.filter((r) => r.value.ownerId === userId);
    if (owned.length === 0) return;
    await this.container.db.guildKV.deleteModuleDataMany(
      MODULE_NAME,
      TempVcData.RECORD,
      owned.map((r) => ({ guildId: r.guildId, targetId: r.targetId })),
    );
    // Bulk delete bypasses removeVcRecord, so refresh the in-memory index on
    // whichever process owns each affected guild.
    for (const guildId of new Set(owned.map((r) => r.guildId))) {
      await tempVcRegistry.reloadVcs(guildId);
    }
  }
}
