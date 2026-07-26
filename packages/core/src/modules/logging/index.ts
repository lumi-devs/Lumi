import { Module, DefineModule, cfg } from "#lib/module-system/Module.js";
import { ChannelType } from "discord.js";

@DefineModule({
  name: "logging",
  displayName: "Logging",
  emoji: "📋",
  version: "1.0.0",
  description:
    "Server event logs: message deletes/edits, joins, leaves, bans, unbans, nickname and role changes.",
  configSchema: cfg.object({
    log_channel_id: cfg.channel({
      label: "Log Channel",
      description: "Channel where server events are logged.",
      channelTypes: [ChannelType.GuildText],
    }),
    message_deletes: cfg.boolean({
      label: "Message Deletes",
      description: "Log deleted messages.",
      default: true,
    }),
    message_edits: cfg.boolean({
      label: "Message Edits",
      description: "Log edited messages (before/after).",
      default: true,
    }),
    member_joins: cfg.boolean({
      label: "Member Joins",
      description: "Log members joining the server.",
      default: true,
    }),
    member_leaves: cfg.boolean({
      label: "Member Leaves",
      description: "Log members leaving the server.",
      default: true,
    }),
    member_bans: cfg.boolean({
      label: "Member Bans",
      description: "Log bans.",
      default: true,
    }),
    member_unbans: cfg.boolean({
      label: "Member Unbans",
      description: "Log unbans.",
      default: true,
    }),
    nickname_changes: cfg.boolean({
      label: "Nickname Changes",
      description: "Log nickname changes.",
      default: true,
    }),
    role_changes: cfg.boolean({
      label: "Role Changes",
      description: "Log member role additions/removals.",
      default: true,
    }),
    ignored_channels: cfg.string({
      label: "Ignored Channel IDs",
      description:
        "Comma-separated channel IDs whose message events are not logged.",
      list: true,
    }),
  }),
})
export class LoggingModule extends Module {
  public override async deleteUserData(
    _userId: string,
  ): Promise<void> {}
}
