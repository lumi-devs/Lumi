import { Module, DefineModule, cfg } from "#lib/module-system/Module.js";
import { registerTaskFireHandler } from "#lib/task-fire-registry.js";
import { invalidateThresholds } from "./lib/thresholds.js";
import { scheduleCaseLift } from "./lib/helpers.js";
import { handleModLiftFire } from "./lib/lift-handler.js";
import { handleWarnDecayFire } from "./lib/warn-decay-handler.js";

@DefineModule({
  name: "mod",
  displayName: "Moderation",
  emoji: "🛡️",
  description: "Staff moderation: warn, mute, kick, ban - with case logging.",
  short: "Staff moderation tools: warn, mute, kick, ban, and case tracking.",
  endUserDataStatement:
    "Stores user IDs in moderation case records, warnings, active punishments, and staff notes. Target user IDs are anonymized upon GDPR erasure while preserving audit integrity; staff notes about the user are deleted.",
  category: "Moderation",
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
    max_multi_targets: cfg.number({
      label: "Max Targets Per Command",
      description:
        "How many members a single mod command (ban, kick, mute, quarantine, etc.) can target at once, e.g. `,mute @a @b @c`.",
      default: 10,
      min: 1,
      max: 25,
    }),
  }),
})
export class ModModule extends Module {
  public override onLoad() {
    this.container.configChangeHooks.set("mod:warn_thresholds", (guildId) =>
      invalidateThresholds(this.container, guildId),
    );
    registerTaskFireHandler("mod-lift", "unicast", handleModLiftFire);
    registerTaskFireHandler("warn-decay", "unicast", handleWarnDecayFire);
    return super.onLoad();
  }

  public override onUnload() {
    this.container.configChangeHooks.delete("mod:warn_thresholds");
    return super.onUnload();
  }

  public override async deleteUserData(userId: string): Promise<void> {
    await this.container.db.moderation.anonymizeUser(userId);
    await this.container.db.modNotes.deleteUserData(userId);
  }

  public override async exportUserData(
    userId: string,
  ): Promise<Record<string, unknown> | null> {
    const cases = await this.container.db.moderation.findCasesForUser(userId);
    if (cases.length === 0) return null;

    // GDPR Recital 63 - redact third-party identity, not just the requester's own data.
    const redacted = cases.map((c) =>
      c.moderatorId === userId
        ? c
        : { ...c, moderatorId: "[redacted: third-party moderator]" },
    );
    return { moderationCases: redacted };
  }

  public override async reconcileScheduledJobs(): Promise<void> {
    let armed = 0;
    for await (const page of this.container.db.moderation.iterateActiveExpiringCases()) {
      await Promise.all(page.map((c) => scheduleCaseLift(this.container, c)));
      armed += page.length;
    }
    if (armed > 0) {
      this.container.logger.debug(
        `[mod] Re-armed ${armed} expiry job(s) on load.`,
      );
    }
  }
}
