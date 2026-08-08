import { Module, DefineModule, cfg } from "#core/module-system/Module.js";
import { registerTaskFireHandler } from "#lib/task-fire-registry.js";
import { handleVerifySweepFire } from "./lib/verify-sweep-handler.js";
import { handleBackupSnapshotFire } from "./lib/backup-snapshot-handler.js";

@DefineModule({
  name: "security",
  displayName: "Security",
  emoji: "🛡️",
  version: "1.0.0",
  description:
    "Wick-style server protection: anti-nuke detection with automatic quarantine.",
  configSchema: cfg.object({
    antinuke_enabled: cfg.boolean({
      group: "Anti-Nuke",
      label: "Anti-Nuke",
      description: "Watch the audit log for mass destructive actions.",
      default: false,
    }),
    window_seconds: cfg.number({
      group: "Anti-Nuke",
      label: "Detection Window",
      description: "Sliding window in seconds for counting actions.",
      default: 60,
      min: 10,
      max: 600,
    }),
    response: cfg.enum(["log", "quarantine", "ban"], {
      group: "Anti-Nuke",
      label: "Response",
      description: "What to do when an executor trips a threshold.",
      default: "quarantine",
    }),
    trusted_role_ids: cfg.string({
      group: "Anti-Nuke",
      label: "Trusted Roles",
      description: "Comma-separated role IDs exempt from anti-nuke.",
      list: true,
    }),
    log_channel_id: cfg.channel({
      group: "Anti-Nuke",
      label: "Security Log Channel",
      description: "Channel for anti-nuke alerts (falls back to mod log).",
    }),
    max_bans: cfg.number({
      group: "Nuke Limits",
      label: "Max Bans",
      description: "Bans allowed per executor within the window.",
      default: 5,
      min: 1,
      max: 50,
    }),
    max_kicks: cfg.number({
      group: "Nuke Limits",
      label: "Max Kicks",
      description: "Kicks allowed per executor within the window.",
      default: 5,
      min: 1,
      max: 50,
    }),
    max_channel_deletes: cfg.number({
      group: "Nuke Limits",
      label: "Max Channel Deletes",
      description: "Channel deletions allowed per executor within the window.",
      default: 3,
      min: 1,
      max: 50,
    }),
    max_role_deletes: cfg.number({
      group: "Nuke Limits",
      label: "Max Role Deletes",
      description: "Role deletions allowed per executor within the window.",
      default: 3,
      min: 1,
      max: 50,
    }),
    max_webhook_creates: cfg.number({
      group: "Nuke Limits",
      label: "Max Webhook Creates",
      description: "Webhook creations allowed per executor within the window.",
      default: 3,
      min: 1,
      max: 50,
    }),
    max_vanity_changes: cfg.number({
      group: "Nuke Limits",
      label: "Max Vanity URL Changes",
      description: "Vanity invite code changes allowed per executor within the window.",
      default: 1,
      min: 1,
      max: 10,
    }),
    max_permission_grants: cfg.number({
      group: "Nuke Limits",
      label: "Max Dangerous Permission Grants",
      description:
        "Times @everyone can be granted a dangerous permission (Administrator, Manage Roles, etc.) per executor within the window before response fires. The grant itself is always reverted immediately.",
      default: 1,
      min: 1,
      max: 10,
    }),
    max_quarantine_bypass: cfg.number({
      group: "Nuke Limits",
      label: "Max Quarantine Bypass Attempts",
      description:
        "Times an executor can attempt to change a quarantined member's roles per executor within the window before response fires. The change itself is always reverted immediately.",
      default: 1,
      min: 1,
      max: 10,
    }),
    panic_lock_mod_commands: cfg.boolean({
      group: "Panic Mode",
      label: "Lock Mod Commands During Panic",
      description:
        "While panic mode is active, only the server owner or whoever triggered it may run moderation commands.",
      default: false,
    }),
    joingate_enabled: cfg.boolean({
      group: "Join Gate",
      label: "Join Gate",
      description: "Screen new members for raids and throwaway accounts.",
      default: false,
    }),
    min_account_age_hours: cfg.number({
      group: "Join Gate",
      label: "Min Account Age (hours)",
      description: "Accounts younger than this are gated. 0 disables the check.",
      default: 0,
      min: 0,
      max: 8760,
    }),
    raid_join_count: cfg.number({
      group: "Join Gate",
      label: "Raid Join Count",
      description: "Joins within the raid window that activate raid mode.",
      default: 10,
      min: 3,
      max: 100,
    }),
    raid_window_seconds: cfg.number({
      group: "Join Gate",
      label: "Raid Window (seconds)",
      description: "Window for counting joins toward raid detection.",
      default: 30,
      min: 5,
      max: 300,
    }),
    raid_action: cfg.enum(["kick", "timeout", "quarantine"], {
      group: "Join Gate",
      label: "Gate Action",
      description: "Action applied to gated joiners during a raid.",
      default: "kick",
    }),
    verification_enabled: cfg.boolean({
      group: "Verification",
      label: "Verification",
      description: "Require members to verify via the panel for the verified role.",
      default: false,
    }),
    verified_role_id: cfg.role({
      group: "Verification",
      label: "Verified Role",
      description: "Role granted after passing the emoji captcha.",
    }),
    verification_pending_role_id: cfg.role({
      group: "Verification",
      label: "Pending Role",
      description: "Role assigned on join and removed once verified. Optional.",
    }),
    verification_timeout_minutes: cfg.number({
      group: "Verification",
      label: "Verify Timeout (minutes)",
      description: "How long a member has to pass the captcha.",
      default: 10,
      min: 1,
      max: 1440,
    }),
    verification_kick_on_timeout: cfg.boolean({
      group: "Verification",
      label: "Kick on Timeout",
      description: "Kick members who don't verify before the timeout.",
      default: false,
    }),
    panic_lock_channel_ids: cfg.string({
      group: "Panic Mode",
      label: "Channels to Lock",
      description:
        "Comma-separated channel IDs locked by /panic. Blank locks every text channel.",
      list: true,
    }),
    backup_interval_hours: cfg.number({
      group: "Backups",
      label: "Backup Interval (hours)",
      description:
        "How often to snapshot role/channel structure while Anti-Nuke is on, for the Restore System.",
      default: 3,
      min: 1,
      max: 168,
    }),
    backup_keep_count: cfg.number({
      group: "Backups",
      label: "Backups to Keep",
      description: "Older backups past this count are pruned.",
      default: 10,
      min: 1,
      max: 50,
    }),
  }),
})
export class SecurityModule extends Module {
  public override onLoad() {
    registerTaskFireHandler(
      "security-verify-sweep",
      "broadcast",
      handleVerifySweepFire,
    );
    registerTaskFireHandler(
      "security-backup-snapshot",
      "broadcast",
      handleBackupSnapshotFire,
    );
    return super.onLoad();
  }
}
