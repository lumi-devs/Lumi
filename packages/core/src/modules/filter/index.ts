import { Module, DefineModule, cfg } from "#lib/module-system/Module.js";
import { tryGetService } from "#lib/module-system/Service.js";
import { ChannelType } from "discord.js";
import { DEFAULT_WARN_MESSAGE } from "./lib/rules.js";

/** Config keys the FilterService compiles into its per-guild rule set —
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
      label: "Filtered Terms",
      description: "Comma-separated list of words/phrases to block.",
      list: true,
    }),
    regex_rules: cfg.string({
      label: "Regex Rules",
      description:
        "Comma-separated regular expressions to block (case-insensitive, max 256 chars each). Invalid patterns are skipped.",
      list: true,
    }),
    block_invites: cfg.boolean({
      label: "Block Invites",
      description: "Delete messages containing Discord server invites.",
      default: false,
    }),
    invite_allowlist: cfg.string({
      label: "Allowed Invite Codes",
      description:
        "Comma-separated invite codes that are always allowed (e.g. your own server's).",
      list: true,
    }),
    block_links: cfg.boolean({
      label: "Block Links",
      description:
        "Delete messages containing links, except allowlisted domains.",
      default: false,
    }),
    link_allowlist: cfg.string({
      label: "Allowed Link Domains",
      description:
        "Comma-separated domains exempt from link blocking (subdomains included), e.g. youtube.com, github.com.",
      list: true,
    }),
    max_mentions: cfg.number({
      label: "Max Mentions",
      description:
        "Maximum user+role mentions per message. 0 disables the rule.",
      default: 0,
      min: 0,
      max: 50,
    }),
    max_caps_percent: cfg.number({
      label: "Max Caps %",
      description:
        "Delete messages whose letters are more than this % uppercase. 0 disables the rule.",
      default: 0,
      min: 0,
      max: 100,
    }),
    caps_min_length: cfg.number({
      label: "Caps Min Length",
      description: "Messages shorter than this never trip the caps rule.",
      default: 12,
      min: 1,
      max: 500,
    }),
    exempt_roles: cfg.string({
      label: "Exempt Role IDs",
      description:
        "Comma-separated role IDs that bypass all filter rules (members with Manage Messages are always exempt).",
      list: true,
    }),
    timeout_minutes: cfg.number({
      label: "Timeout (minutes)",
      description:
        "Timeout the author for this many minutes on a filter hit. 0 disables punishment.",
      default: 0,
      min: 0,
      max: 40_320,
    }),
    warn_message: cfg.string({
      label: "Warning Message",
      description:
        "Transient warning sent after a deletion. Placeholders: {user}, {reason}. Empty disables the warning.",
      default: DEFAULT_WARN_MESSAGE,
    }),
    log_channel_id: cfg.channel({
      label: "Log Channel",
      description: "Channel where filter hits are logged.",
      channelTypes: [ChannelType.GuildText],
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
