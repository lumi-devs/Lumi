import { defineModule } from "#src/lib/module-system/Module.js";
import type { Container } from "#src/lib/Services.js";
import { cfg } from "#src/lib/module-system/ConfigSchema.js";
import { LevelingModuleName } from "#src/modules/leveling/Constants.js";
import { AnnounceMessageDefault } from "#src/modules/leveling/Config.js";
import { LevelFormulas } from "#src/modules/leveling/services/Formulas.js";

export const levelingModule = defineModule({
  name: LevelingModuleName,
  displayName: "Leveling",
  emoji: "🏆",
  description:
    "Message and voice XP with 7 selectable level formulas, rank cards, leaderboards, level-up announcements, and role rewards.",
  short: "Message and voice XP with rank cards and leaderboards.",
  endUserDataStatement:
    "Stores user ID with level, XP, message counts, and voice minutes per server. Deleted on GDPR erasure.",
  category: "Community",
  configSchema: cfg.object({
    level_formula: cfg.enum(LevelFormulas, {
      label: "Level Formula",
      description:
        "Curve for XP required per level: disgaea, fibonacci, linear, mee6, atlas, arcane, or lurkr.",
      default: "disgaea",
      group: "Formulas",
    }),
    message_xp: cfg.number({
      label: "Message XP",
      description: "XP granted per rewarded message, before multipliers.",
      default: 15,
      min: 1,
      max: 1000,
      group: "Messages",
    }),
    message_cooldown: cfg.duration({
      label: "Message Cooldown",
      description: "How long a member waits between rewarded messages.",
      default: "1m",
      quickPicks: ["30s", "1m", "2m", "5m"],
      group: "Messages",
    }),
    min_message_length: cfg.number({
      label: "Minimum Message Length",
      description: "Messages shorter than this earn no XP but still count.",
      default: 4,
      min: 0,
      max: 500,
      group: "Messages",
    }),
    voice_enabled: cfg.boolean({
      label: "Voice XP Enabled",
      description: "Track voice minutes and grant XP for time in voice channels.",
      default: true,
      group: "Voice",
    }),
    voice_xp_per_minute: cfg.number({
      label: "Voice XP Per Minute",
      description: "XP granted per audible minute in voice, before multipliers.",
      default: 4,
      min: 1,
      max: 1000,
      group: "Voice",
    }),
    announce_enabled: cfg.boolean({
      label: "Level-Up Announcements",
      description: "Post a message when a member levels up.",
      default: true,
      group: "Announcements",
    }),
    announce_channel: cfg.channel({
      label: "Announcement Channel",
      description:
        "Channel for level-up messages. Empty falls back to where they leveled up, then the system channel.",
      group: "Announcements",
    }),
    announce_message: cfg.string({
      label: "Announcement Message",
      description:
        "Level-up message template. Supports {user}, {level}, {xp} and {xpNeeded}.",
      default: AnnounceMessageDefault,
      format: "template",
      templateVars: ["user", "level", "xp", "xpNeeded"],
      group: "Announcements",
    }),
    ignored_channels: cfg.multiChannel({
      label: "Ignored Channels",
      description: "Messages here earn no XP.",
      default: [],
      group: "Filters",
    }),
    ignored_roles: cfg.multiRole({
      label: "Ignored Roles",
      description: "Members with any of these roles earn no XP.",
      default: [],
      group: "Filters",
    }),
    level_rewards: cfg.objectArray(
      {
        level: cfg.number({
          label: "Level",
          description: "Level that grants the role.",
        }),
        roleId: cfg.role({
          label: "Role",
          description: "Role granted at the level.",
        }),
      },
      {
        label: "Level Role Rewards",
        description: "Roles granted when members reach levels.",
        default: [],
        group: "Rewards",
      },
    ),
    role_stack: cfg.boolean({
      label: "Stack Reward Roles",
      description:
        "Keep every earned reward role. Off swaps to the highest earned one.",
      default: true,
      group: "Rewards",
    }),
    keep_xp_on_leave: cfg.boolean({
      label: "Keep XP On Leave",
      description:
        "Keep progress and restore reward roles on rejoin. Off wipes progress when a member leaves.",
      default: true,
      group: "General",
    }),
    global_multiplier: cfg.number({
      label: "Global XP Multiplier",
      description: "Multiplies all XP gains on this server.",
      default: 1,
      min: 0,
      max: 100,
      group: "Multipliers",
    }),
    role_multipliers: cfg.stringList({
      label: "Role Multipliers",
      description: "Per-role XP multipliers as roleId:mult entries. Highest applies.",
      default: [],
      group: "Multipliers",
    }),
    channel_multipliers: cfg.stringList({
      label: "Channel Multipliers",
      description: "Per-channel XP multipliers as channelId:mult entries.",
      default: [],
      group: "Multipliers",
    }),
  }),
  async deleteUserData(services: Container, userId: string): Promise<void> {
    await services.db.leveling.deleteForUser(userId);
  },

  async exportUserData(
    services: Container,
    userId: string,
  ): Promise<Record<string, unknown> | null> {
    const accounts = await services.db.leveling.findAccountsForUser(userId);
    if (accounts.length === 0) return null;
    return { accounts };
  },
});
