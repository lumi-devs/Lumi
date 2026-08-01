import { Module, DefineModule } from "#lib/module-system/Module.js";
import { MODULE_NAME } from "./keys.js";
import { tempVcRegistry } from "./registry.js";
import { registerTaskFireHandler } from "#lib/task-fire-registry.js";
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

  public override async deleteUserData(userId: string): Promise<void> {
    const owned = await this.container.db.tempvc.findRecordsForOwner(userId);
    if (owned.length === 0) return;
    await this.container.db.tempvc.deleteRecordsForOwner(userId);
    for (const guildId of new Set(owned.map((r) => r.guildId))) {
      await tempVcRegistry.reloadVcs(guildId);
    }
  }
}
