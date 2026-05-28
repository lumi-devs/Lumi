import { Module, EmberModule, cfg } from "#core/module-system/Module.js";
import type { RequesterType } from "#core/lib/gdpr.js";
import { registerTaskFireHandler } from "#core/lib/task-fire-registry.js";
import { invalidateThresholds } from "./lib/thresholds.js";
import { scheduleCaseLift } from "./lib/helpers.js";
import { handleModLiftFire } from "./lib/lift-handler.js";

@EmberModule({
  name: "mod",
  displayName: "Moderation",
  emoji: "🛡️",
  version: "1.0.0",
  description: "Staff moderation: warn, mute, kick, ban — with case logging.",
  configSchema: cfg.object({
    log_channel_id: cfg.channel({
      label: "Mod Log Channel",
      description: "Channel where moderation action embeds are posted.",
    }),
    quarantine_role_id: cfg.role({
      label: "Quarantine Role",
      description:
        "Role assigned when a member is quarantined (replaces all their roles).",
    }),
    warn_thresholds: cfg.string({
      label: "Warn Thresholds",
      description:
        'JSON map of warn count → action. E.g. {"3":{"action":"mute","duration":"1h"},"5":{"action":"ban"}}',
    }),
  }),
})
export class ModModule extends Module {
  public override onLoad() {
    this.container.configChangeHooks.set("mod:warn_thresholds", (guildId) =>
      invalidateThresholds(this.container, guildId),
    );
    registerTaskFireHandler("mod-lift", "unicast", handleModLiftFire);
    return super.onLoad();
  }

  public override onUnload() {
    this.container.configChangeHooks.delete("mod:warn_thresholds");
    return super.onUnload();
  }

  public override async deleteUserData(
    userId: string,
    _requester: RequesterType,
  ): Promise<void> {
    await this.container.db.moderation.anonymizeUser(userId);
  }

  public override async reconcileScheduledJobs(): Promise<void> {
    const cases = await this.container.db.moderation.getActiveExpiringCases();
    await Promise.all(cases.map((c) => scheduleCaseLift(this.container, c)));
    if (cases.length > 0) {
      this.container.logger.debug(
        `[mod] Re-armed ${cases.length} expiry job(s) on load.`,
      );
    }
  }
}
