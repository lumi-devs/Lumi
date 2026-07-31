import { Module, DefineModule, cfg } from "#lib/module-system/Module.js";
import { tryGetService } from "#lib/module-system/Service.js";
import { ChannelType } from "discord.js";
import { DEFAULT_WARN_MESSAGE } from "./lib/rules.js";

/** Config keys the FilterService compiles into its per-guild rule set -
 * changing any of them must rebuild that guild's cache. */
const COMPILED_KEYS = [
  "terms",
  "regex_rules",
  "block_invites",
  "invite_allowlist",
  "block_links",
  "link_allowlist",
  "max_mentions",
  "max_caps_percent",
  "caps_min_length",
  "heat_enabled",
  "heat_per_message",
  "heat_per_mention",
  "heat_per_duplicate",
  "heat_per_filter_hit",
  "heat_decay_per_minute",
  "heat_warn",
  "heat_timeout",
  "heat_quarantine",
  "heat_timeout_minutes",
] as const;

@DefineModule({
  name: "filter",
  displayName: "Filter",
  emoji: "🚫",
  version: "2.0.0",
  description:
    "Automod rule engine: filtered terms (Aho-Corasick), regex rules, invite/link blocking with allowlists, mention-spam and caps limits, with configurable punishment and logging.",
  configSchema: cfg.object({
    terms: cfg.string({
      group: "Terms & Patterns",
      label: "Filtered Terms",
      description: "Comma-separated list of words/phrases to block.",
      list: true,
    }),
    regex_rules: cfg.string({
      group: "Terms & Patterns",
      label: "Regex Rules",
      description:
        "Comma-separated regular expressions to block (case-insensitive, max 256 chars each). Invalid patterns are skipped.",
      list: true,
    }),
    block_invites: cfg.boolean({
      group: "Invites & Links",
      label: "Block Invites",
      description: "Delete messages containing Discord server invites.",
      default: false,
    }),
    invite_allowlist: cfg.string({
      group: "Invites & Links",
      label: "Allowed Invite Codes",
      description:
        "Comma-separated invite codes that are always allowed (e.g. your own server's).",
      list: true,
    }),
    block_links: cfg.boolean({
      group: "Invites & Links",
      label: "Block Links",
      description:
        "Delete messages containing links, except allowlisted domains.",
      default: false,
    }),
    link_allowlist: cfg.string({
      group: "Invites & Links",
      label: "Allowed Link Domains",
      description:
        "Comma-separated domains exempt from link blocking (subdomains included), e.g. youtube.com, github.com.",
      list: true,
    }),
    max_mentions: cfg.number({
      group: "Spam Limits",
      label: "Max Mentions",
      description:
        "Maximum user+role mentions per message. 0 disables the rule.",
      default: 0,
      min: 0,
      max: 50,
    }),
    max_caps_percent: cfg.number({
      group: "Spam Limits",
      label: "Max Caps %",
      description:
        "Delete messages whose letters are more than this % uppercase. 0 disables the rule.",
      default: 0,
      min: 0,
      max: 100,
    }),
    caps_min_length: cfg.number({
      group: "Spam Limits",
      label: "Caps Min Length",
      description: "Messages shorter than this never trip the caps rule.",
      default: 12,
      min: 1,
      max: 500,
    }),
    exempt_roles: cfg.string({
      group: "Punishment",
      label: "Exempt Role IDs",
      description:
        "Comma-separated role IDs that bypass all filter rules (members with Manage Messages are always exempt).",
      list: true,
    }),
    timeout_minutes: cfg.number({
      group: "Punishment",
      label: "Timeout (minutes)",
      description:
        "Timeout the author for this many minutes on a filter hit. 0 disables punishment.",
      default: 0,
      min: 0,
      max: 40_320,
    }),
    warn_message: cfg.string({
      group: "Punishment",
      label: "Warning Message",
      description:
        "Transient warning sent after a deletion. Placeholders: {user}, {reason}. Empty disables the warning.",
      default: DEFAULT_WARN_MESSAGE,
    }),
    log_channel_id: cfg.channel({
      group: "Punishment",
      label: "Log Channel",
      description: "Channel where filter hits are logged.",
      channelTypes: [ChannelType.GuildText],
    }),
    heat_enabled: cfg.boolean({
      group: "Heat Scoring",
      label: "Heat System",
      description:
        "Accumulate a decaying heat score per member and escalate on spam bursts.",
      default: false,
    }),
    heat_per_message: cfg.number({
      group: "Heat Scoring",
      label: "Heat per Message",
      description: "Heat added for every message. 0 disables the baseline.",
      default: 0,
      min: 0,
      max: 100,
    }),
    heat_per_mention: cfg.number({
      group: "Heat Scoring",
      label: "Heat per Mention",
      description: "Heat added per user/role mention in a message.",
      default: 3,
      min: 0,
      max: 100,
    }),
    heat_per_duplicate: cfg.number({
      group: "Heat Scoring",
      label: "Heat per Duplicate",
      description: "Heat added when a message repeats the member's previous one.",
      default: 5,
      min: 0,
      max: 100,
    }),
    heat_per_filter_hit: cfg.number({
      group: "Heat Scoring",
      label: "Heat per Filter Hit",
      description: "Heat added when a message trips a hard filter rule.",
      default: 10,
      min: 0,
      max: 100,
    }),
    heat_decay_per_minute: cfg.number({
      group: "Heat Scoring",
      label: "Heat Decay / min",
      description: "Heat points bled off per minute.",
      default: 10,
      min: 1,
      max: 100,
    }),
    heat_warn: cfg.number({
      group: "Heat Thresholds",
      label: "Warn Threshold",
      description: "Heat at which the member gets a slow-down warning. 0 disables.",
      default: 15,
      min: 0,
      max: 1000,
    }),
    heat_timeout: cfg.number({
      group: "Heat Thresholds",
      label: "Timeout Threshold",
      description: "Heat at which the member is timed out. 0 disables.",
      default: 30,
      min: 0,
      max: 1000,
    }),
    heat_quarantine: cfg.number({
      group: "Heat Thresholds",
      label: "Quarantine Threshold",
      description: "Heat at which the member is quarantined. 0 disables.",
      default: 0,
      min: 0,
      max: 1000,
    }),
    heat_timeout_minutes: cfg.number({
      group: "Heat Thresholds",
      label: "Heat Timeout (minutes)",
      description: "Timeout duration applied at the timeout threshold.",
      default: 10,
      min: 1,
      max: 40_320,
    }),
  }),
})
export class FilterModule extends Module {
  public override onLoad() {
    for (const key of COMPILED_KEYS) {
      this.container.configChangeHooks.set(
        `filter:${key}`,
        async (guildId, _key) => {
          const svc = tryGetService("filter");
          await svc?.loadGuild(guildId);
        },
      );
    }
    return super.onLoad();
  }

  public override onUnload() {
    for (const key of COMPILED_KEYS) {
      this.container.configChangeHooks.delete(`filter:${key}`);
    }
    return super.onUnload();
  }
}
