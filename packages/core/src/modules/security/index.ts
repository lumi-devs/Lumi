import {
  Module,
  DefineModule,
  NoEndUserData,
  cfg,
} from "#core/module-system/Module.js";
import { registerTaskFireHandler } from "#lib/task-fire-registry.js";
import { handleVerifySweepFire } from "./lib/verify-sweep-handler.js";
import { handleBackupSnapshotFire } from "./lib/backup-snapshot-handler.js";

@DefineModule({
  name: "security",
  displayName: "Security",
  emoji: "🛡️",
  description:
    "Server protection: anti-nuke detection with automatic quarantine.",
  short: "Server protection: anti-nuke thresholds, raid detection, and verification.",
  endUserDataStatement: NoEndUserData(),
  category: "Security",
  dashboardHref: "security",
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
    response_bans: cfg.enum(["log", "quarantine", "ban"], {
      group: "Nuke Limits",
      label: "Response — Bans",
      description: "Action taken when the ban threshold trips.",
      default: "quarantine",
    }),
    max_kicks: cfg.number({
      group: "Nuke Limits",
      label: "Max Kicks",
      description: "Kicks allowed per executor within the window.",
      default: 5,
      min: 1,
      max: 50,
    }),
    response_kicks: cfg.enum(["log", "quarantine", "ban"], {
      group: "Nuke Limits",
      label: "Response — Kicks",
      description: "Action taken when the kick threshold trips.",
      default: "quarantine",
    }),
    max_channel_deletes: cfg.number({
      group: "Nuke Limits",
      label: "Max Channel Deletes",
      description: "Channel deletions allowed per executor within the window.",
      default: 3,
      min: 1,
      max: 50,
    }),
    response_channel_deletes: cfg.enum(["log", "quarantine", "ban"], {
      group: "Nuke Limits",
      label: "Response — Channel Deletes",
      description: "Action taken when the channel-delete threshold trips.",
      default: "quarantine",
    }),
    max_role_deletes: cfg.number({
      group: "Nuke Limits",
      label: "Max Role Deletes",
      description: "Role deletions allowed per executor within the window.",
      default: 3,
      min: 1,
      max: 50,
    }),
    response_role_deletes: cfg.enum(["log", "quarantine", "ban"], {
      group: "Nuke Limits",
      label: "Response — Role Deletes",
      description: "Action taken when the role-delete threshold trips.",
      default: "quarantine",
    }),
    max_webhook_creates: cfg.number({
      group: "Nuke Limits",
      label: "Max Webhook Creates",
      description: "Webhook creations allowed per executor within the window.",
      default: 3,
      min: 1,
      max: 50,
    }),
    response_webhook_creates: cfg.enum(["log", "quarantine", "ban"], {
      group: "Nuke Limits",
      label: "Response — Webhook Creates",
      description: "Action taken when the webhook-create threshold trips.",
      default: "quarantine",
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
    raid_account_type: cfg.enum(["all", "suspicious"], {
      group: "Join Gate",
      label: "Raid Response Scope",
      description:
        "Apply the raid action to every joiner, or only ones flagged suspicious (no avatar, low account age, similar username to a recent joiner, or bulk-created).",
      default: "all",
    }),
    raid_warn_role_ids: cfg.string({
      group: "Join Gate",
      label: "Raid Warn Roles",
      description:
        "Comma-separated role IDs mentioned in the log message when raid mode activates.",
      list: true,
    }),
    filter_no_avatar_enabled: cfg.boolean({
      group: "Join Gate Filters",
      label: "Filter: No Avatar",
      description: "Flag members who have never set a custom avatar.",
      default: false,
    }),
    filter_no_avatar_action: cfg.enum(["log", "kick", "timeout", "quarantine"], {
      group: "Join Gate Filters",
      label: "No Avatar Action",
      description: "Action taken when the no-avatar filter trips.",
      default: "log",
    }),
    filter_min_age_enabled: cfg.boolean({
      group: "Join Gate Filters",
      label: "Filter: Min Account Age",
      description: "Flag accounts younger than the configured age.",
      default: false,
    }),
    filter_min_age_hours: cfg.number({
      group: "Join Gate Filters",
      label: "Min Account Age (hours)",
      description: "Accounts younger than this trip the filter.",
      default: 0,
      min: 0,
      max: 8760,
    }),
    filter_min_age_action: cfg.enum(["log", "kick", "timeout", "quarantine"], {
      group: "Join Gate Filters",
      label: "Min Age Action",
      description: "Action taken when the min-age filter trips.",
      default: "kick",
    }),
    filter_unverified_bot_enabled: cfg.boolean({
      group: "Join Gate Filters",
      label: "Filter: Unverified Bots",
      description: "Flag bot accounts that aren't Discord-verified.",
      default: false,
    }),
    filter_unverified_bot_action: cfg.enum(["log", "kick", "timeout", "quarantine"], {
      group: "Join Gate Filters",
      label: "Unverified Bot Action",
      description: "Action taken when the unverified-bot filter trips.",
      default: "kick",
    }),
    filter_username_pattern_enabled: cfg.boolean({
      group: "Join Gate Filters",
      label: "Filter: Username Pattern",
      description: "Flag members whose username contains a configured substring.",
      default: false,
    }),
    filter_username_pattern: cfg.string({
      group: "Join Gate Filters",
      label: "Username Patterns",
      description: "Comma-separated substrings matched (case-insensitively) against usernames.",
      list: true,
    }),
    filter_username_pattern_action: cfg.enum(["log", "kick", "timeout", "quarantine"], {
      group: "Join Gate Filters",
      label: "Username Pattern Action",
      description: "Action taken when the username-pattern filter trips.",
      default: "log",
    }),
    filter_advertising_enabled: cfg.boolean({
      group: "Join Gate Filters",
      label: "Filter: Advertising Account",
      description: "Flag members whose display name itself is a link or invite (ad/scam accounts).",
      default: false,
    }),
    filter_advertising_action: cfg.enum(["log", "kick", "timeout", "quarantine"], {
      group: "Join Gate Filters",
      label: "Advertising Account Action",
      description: "Action taken when the advertising-account filter trips.",
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
    verification_mode: cfg.enum(["emoji", "none", "web"], {
      group: "Verification",
      label: "Verification Mode",
      description:
        "How members prove they're human: emoji sequence, one-click, or a web challenge on the dashboard.",
      default: "emoji",
    }),
    verification_target: cfg.enum(["everyone", "suspicious"], {
      group: "Verification",
      label: "Verification Target",
      description:
        "Require verification from everyone, or only accounts flagged as suspicious (new or no avatar).",
      default: "everyone",
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
