import { Module, DefineModule, cfg } from "#core/module-system/Module.js";

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
  }),
})
export class SecurityModule extends Module {}
