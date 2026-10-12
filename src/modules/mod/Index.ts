import { defineModule } from "#src/lib/module-system/Module.js";
import { container, type Container } from "#src/lib/Services.js";
import { cfg } from "#src/lib/module-system/ConfigSchema.js";
import { registerCaseTypes } from "#src/lib/api/moderation/CaseTypes.js";
import { registerTaskFireHandler } from "#src/lib/scheduler/Fires.js";
import { invalidateThresholds } from "#src/modules/mod/data/ThresholdRules.js";
import { scheduleCaseLift } from "#src/modules/mod/services/Helpers.js";
import { handleModLiftFire } from "#src/modules/mod/services/LiftHandler.js";
import { handleWarnDecayFire } from "#src/modules/mod/services/WarnDecayHandler.js";

export const modModule = defineModule({
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
      claimable: true,
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
    predefined_reasons: cfg.stringList({
      label: "Predefined Reasons",
      description:
        "Common punishment reasons to suggest as autocomplete on the reason field, one per line.",
    }),
    immune_role_ids: cfg.multiRole({
      label: "Immune Role IDs",
      description:
        "Role IDs exempt from automated escalation (heat timeouts/quarantine, anti-nuke responses, warn-threshold auto-actions). Manual staff commands (/ban, /warn, etc.) always work regardless.",
    }),
    duplicate_case_window_minutes: cfg.number({
      label: "Duplicate Case Window (minutes)",
      description:
        "Before opening a new case, warn staff if a similar case against the same member was opened within this many minutes. 0 disables the check.",
      default: 5,
      min: 0,
      max: 1440,
    }),
  }),
  onLoad(services: Container = container) {
    registerCaseTypes(
      { name: "ban", emoji: "🔨" },
      { name: "unban", emoji: "🔓" },
      { name: "kick", emoji: "👢" },
      { name: "mute", emoji: "🔇" },
      { name: "unmute", emoji: "🔊" },
      { name: "softban", emoji: "🧹" },
      { name: "voice_mute", emoji: "🎙️" },
      { name: "unvoice_mute", emoji: "🎙️" },
      { name: "warn", emoji: "⚠️" },
      { name: "quarantine", emoji: "🚧" },
      { name: "unquarantine", emoji: "✅" },
    );
    services.configChangeHooks.set("mod:warn_thresholds", (guildId) =>
      invalidateThresholds(services, guildId),
    );
    registerTaskFireHandler("mod-lift", "unicast", handleModLiftFire);
    registerTaskFireHandler("warn-decay", "unicast", handleWarnDecayFire);
  },

  onUnload(services: Container = container) {
    services.configChangeHooks.delete("mod:warn_thresholds");
  },

  async deleteUserData(services: Container, userId: string): Promise<void> {
    await services.db.moderation.anonymizeUser(userId);
    await services.db.modNotes.deleteUserData(userId);
  },

  async exportUserData(
    services: Container,
    userId: string,
  ): Promise<Record<string, unknown> | null> {
    const cases = await services.db.moderation.findCasesForUser(userId);
    if (cases.length === 0) return null;

    const redacted = cases.map((c) =>
      c.moderatorId === userId
        ? c
        : { ...c, moderatorId: "[redacted: third-party moderator]" },
    );
    return { moderationCases: redacted };
  },

  async reconcileScheduledJobs(services: Container = container): Promise<void> {
    let armed = 0;
    for await (const page of services.db.moderation.iterateActiveExpiringCases()) {
      await Promise.all(page.map((c) => scheduleCaseLift(services, c)));
      armed += page.length;
    }
    if (armed > 0) {
      services.logger.debug(
        `[mod] Re-armed ${armed} expiry job(s) on load.`,
      );
    }
  },
});
