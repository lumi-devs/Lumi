import {
  Module,
  DefineModule,
  NoEndUserData,
  cfg,
} from "#lib/module-system/Module.js";
import { ChannelType } from "discord.js";

@DefineModule({
  name: "logging",
  displayName: "Logging",
  emoji: "📋",
  description:
    "Server event logs: message deletes/edits, joins, leaves, bans, unbans, nickname and role changes.",
  short: "Server event logging for moderation, messages, and member actions.",
  endUserDataStatement: NoEndUserData(),
  category: "System",
  configSchema: cfg.object({
    log_channel_id: cfg.channel({
      section: "Setup",
      group: "Setup",
      label: "Default Log Channel",
      description:
        "Fallback channel for log types without their own channel below. Empty disables logging.",
      channelTypes: [ChannelType.GuildText],
      claimable: true,
    }),
    message_log_channel_id: cfg.channel({
      section: "Message Events",
      group: "Message Events",
      label: "Message Log Channel",
      description:
        "Channel for message deletes and edits. Falls back to the default log channel.",
      channelTypes: [ChannelType.GuildText],
      claimable: true,
    }),
    member_log_channel_id: cfg.channel({
      section: "Member Events",
      group: "Member Events",
      label: "Member Log Channel",
      description:
        "Channel for joins, leaves, bans, unbans, nickname and role changes. Falls back to the default log channel.",
      channelTypes: [ChannelType.GuildText],
      claimable: true,
    }),
    message_deletes: cfg.boolean({
      section: "Message Events",
      group: "Message Events",
      label: "Message Deletes",
      description: "Log deleted messages.",
      default: true,
      pairedWith: "message_deletes_channel_id",
    }),
    message_deletes_channel_id: cfg.channel({
      section: "Message Events",
      group: "Message Events",
      label: "Message Deletes Channel",
      description:
        "Override for deleted messages. Empty uses the Message Events channel.",
      channelTypes: [ChannelType.GuildText],
      claimable: true,
    }),
    message_edits: cfg.boolean({
      section: "Message Events",
      group: "Message Events",
      label: "Message Edits",
      description: "Log edited messages (before/after).",
      default: true,
      pairedWith: "message_edits_channel_id",
    }),
    message_edits_channel_id: cfg.channel({
      section: "Message Events",
      group: "Message Events",
      label: "Message Edits Channel",
      description:
        "Override for edited messages. Empty uses the Message Events channel.",
      channelTypes: [ChannelType.GuildText],
      claimable: true,
    }),
    member_joins: cfg.boolean({
      section: "Member Events",
      group: "Member Events",
      label: "Member Joins",
      description: "Log members joining the server.",
      default: true,
      pairedWith: "member_joins_channel_id",
    }),
    member_joins_channel_id: cfg.channel({
      section: "Member Events",
      group: "Member Events",
      label: "Member Joins Channel",
      description:
        "Override for member joins. Empty uses the Member Events channel.",
      channelTypes: [ChannelType.GuildText],
      claimable: true,
    }),
    member_leaves: cfg.boolean({
      section: "Member Events",
      group: "Member Events",
      label: "Member Leaves",
      description: "Log members leaving the server.",
      default: true,
      pairedWith: "member_leaves_channel_id",
    }),
    member_leaves_channel_id: cfg.channel({
      section: "Member Events",
      group: "Member Events",
      label: "Member Leaves Channel",
      description:
        "Override for member leaves. Empty uses the Member Events channel.",
      channelTypes: [ChannelType.GuildText],
      claimable: true,
    }),
    member_bans: cfg.boolean({
      section: "Member Events",
      group: "Member Events",
      label: "Member Bans",
      description: "Log bans.",
      default: true,
      pairedWith: "member_bans_channel_id",
    }),
    member_bans_channel_id: cfg.channel({
      section: "Member Events",
      group: "Member Events",
      label: "Member Bans Channel",
      description: "Override for bans. Empty uses the Member Events channel.",
      channelTypes: [ChannelType.GuildText],
      claimable: true,
    }),
    member_unbans: cfg.boolean({
      section: "Member Events",
      group: "Member Events",
      label: "Member Unbans",
      description: "Log unbans.",
      default: true,
      pairedWith: "member_unbans_channel_id",
    }),
    member_unbans_channel_id: cfg.channel({
      section: "Member Events",
      group: "Member Events",
      label: "Member Unbans Channel",
      description:
        "Override for unbans. Empty uses the Member Events channel.",
      channelTypes: [ChannelType.GuildText],
      claimable: true,
    }),
    nickname_changes: cfg.boolean({
      section: "Member Events",
      group: "Member Events",
      label: "Nickname Changes",
      description: "Log nickname changes.",
      default: true,
      pairedWith: "nickname_changes_channel_id",
    }),
    nickname_changes_channel_id: cfg.channel({
      section: "Member Events",
      group: "Member Events",
      label: "Nickname Changes Channel",
      description:
        "Override for nickname changes. Empty uses the Member Events channel.",
      channelTypes: [ChannelType.GuildText],
      claimable: true,
    }),
    role_changes: cfg.boolean({
      section: "Member Events",
      group: "Member Events",
      label: "Role Changes",
      description: "Log member role additions/removals.",
      default: true,
      pairedWith: "role_changes_channel_id",
    }),
    role_changes_channel_id: cfg.channel({
      section: "Member Events",
      group: "Member Events",
      label: "Role Changes Channel",
      description:
        "Override for role changes. Empty uses the Member Events channel.",
      channelTypes: [ChannelType.GuildText],
      claimable: true,
    }),
    ignored_channels: cfg.multiChannel({
      section: "Setup",
      group: "Setup",
      label: "Ignored Channel IDs",
      description:
        "Channel IDs whose message events are not logged.",
    }),
  }),
})
export class LoggingModule extends Module {
  public override async deleteUserData(
    _userId: string,
  ): Promise<void> {}

  public override exportUserData(
    _userId: string,
  ): Record<string, unknown> | null {
    return null;
  }
}
