import { Module, DefineModule, cfg } from "#core/module-system/Module.js";
import { registerTaskFireHandler } from "#lib/task-fire-registry.js";
import { handleVerifySweepFire } from "./lib/verify-sweep-handler.js";

@DefineModule({
  name: "security",
  displayName: "Security",
  emoji: "🛡️",
  version: "1.0.0",
  description:
    "Wick-style server protection: anti-nuke detection with automatic quarantine.",
  configSchema: cfg.object({
    antinuke_enabled: cfg.boolean({
      label: "Anti-Nuke",
      description: "Watch the audit log for mass destructive actions.",
      default: false,
    }),
    window_seconds: cfg.number({
      label: "Detection Window",
      description: "Sliding window in seconds for counting actions.",
      default: 60,
      min: 10,
      max: 600,
    }),
    max_bans: cfg.number({
      label: "Max Bans",
      description: "Bans allowed per executor within the window.",
      default: 5,
      min: 1,
      max: 50,
    }),
    max_kicks: cfg.number({
      label: "Max Kicks",
      description: "Kicks allowed per executor within the window.",
      default: 5,
      min: 1,
      max: 50,
    }),
    max_channel_deletes: cfg.number({
      label: "Max Channel Deletes",
      description: "Channel deletions allowed per executor within the window.",
      default: 3,
      min: 1,
      max: 50,
    }),
    max_role_deletes: cfg.number({
      label: "Max Role Deletes",
      description: "Role deletions allowed per executor within the window.",
      default: 3,
      min: 1,
      max: 50,
    }),
    max_webhook_creates: cfg.number({
      label: "Max Webhook Creates",
      description: "Webhook creations allowed per executor within the window.",
      default: 3,
      min: 1,
      max: 50,
    }),
    response: cfg.enum(["log", "quarantine", "ban"], {
      label: "Response",
      description: "What to do when an executor trips a threshold.",
      default: "quarantine",
    }),
    trusted_role_ids: cfg.string({
      label: "Trusted Roles",
      description: "Comma-separated role IDs exempt from anti-nuke.",
      list: true,
    }),
    log_channel_id: cfg.channel({
      label: "Security Log Channel",
      description: "Channel for anti-nuke alerts (falls back to mod log).",
    }),
    joingate_enabled: cfg.boolean({
      label: "Join Gate",
      description: "Screen new members for raids and throwaway accounts.",
      default: false,
    }),
    min_account_age_hours: cfg.number({
      label: "Min Account Age (hours)",
      description: "Accounts younger than this are gated. 0 disables the check.",
      default: 0,
      min: 0,
      max: 8760,
    }),
    raid_join_count: cfg.number({
      label: "Raid Join Count",
      description: "Joins within the raid window that activate raid mode.",
      default: 10,
      min: 3,
      max: 100,
    }),
    raid_window_seconds: cfg.number({
      label: "Raid Window (seconds)",
      description: "Window for counting joins toward raid detection.",
      default: 30,
      min: 5,
      max: 300,
    }),
    raid_action: cfg.enum(["kick", "timeout", "quarantine"], {
      label: "Gate Action",
      description: "Action applied to gated joiners during a raid.",
      default: "kick",
    }),
    verification_enabled: cfg.boolean({
      label: "Verification",
      description: "Require members to verify via the panel for the verified role.",
      default: false,
    }),
    verified_role_id: cfg.role({
      label: "Verified Role",
      description: "Role granted after passing the emoji captcha.",
    }),
    verification_pending_role_id: cfg.role({
      label: "Pending Role",
      description: "Role assigned on join and removed once verified. Optional.",
    }),
    verification_timeout_minutes: cfg.number({
      label: "Verify Timeout (minutes)",
      description: "How long a member has to pass the captcha.",
      default: 10,
      min: 1,
      max: 1440,
    }),
    verification_kick_on_timeout: cfg.boolean({
      label: "Kick on Timeout",
      description: "Kick members who don't verify before the timeout.",
      default: false,
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
    return super.onLoad();
  }
}
