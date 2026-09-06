import { ApplyOptions } from "@sapphire/decorators";
import { type ApplicationCommandRegistry } from "@sapphire/framework";
import { BaseSubcommand, type CommandContext } from "#lib/commands.js";
import {
  isChannelLocked,
  lockChannel,
  unlockChannel,
  type LockableChannel,
} from "#lib/moderation/lockdown.js";
import { formatAuditReason } from "#lib/utilities/misc.js";
import { ChannelType } from "discord.js";

function isLockable(
  channel: unknown,
): channel is LockableChannel {
  const type = (channel as { type?: ChannelType } | null)?.type;
  return type === ChannelType.GuildText || type === ChannelType.GuildAnnouncement;
}

function resolveTargetChannel(ctx: CommandContext): LockableChannel | null {
  const channel = ctx.guild?.channels.cache.get(ctx.channelId);
  return isLockable(channel) ? channel : null;
}

@ApplyOptions<BaseSubcommand.Options>({
  name: "lock",
  description: "Lock or unlock one channel, unlike /lockdown which covers the whole server",
  preconditions: ["GuildOnly"],
  requiredPermit: "mod.lockdown",
  prefixEnabled: true,
  subcommands: [
    { name: "enable", run: "enable", default: true },
    { name: "disable", run: "disable" },
  ],
})
export class LockCommand extends BaseSubcommand {
  public override registerApplicationCommands(
    registry: ApplicationCommandRegistry,
  ) {
    registry.registerChatInputCommand((b) =>
      b
        .setName(this.name)
        .setDescription(this.description)
        .addSubcommand((s) =>
          s
            .setName("enable")
            .setDescription("Deny @everyone SendMessages in a channel")
            .addChannelOption((o) =>
              o
                .setName("channel")
                .setDescription("Channel to lock (defaults to this one)")
                .addChannelTypes(
                  ChannelType.GuildText,
                  ChannelType.GuildAnnouncement,
                )
                .setRequired(false),
            ),
        )
        .addSubcommand((s) =>
          s
            .setName("disable")
            .setDescription("Restore @everyone SendMessages in a channel")
            .addChannelOption((o) =>
              o
                .setName("channel")
                .setDescription("Channel to unlock (defaults to this one)")
                .addChannelTypes(
                  ChannelType.GuildText,
                  ChannelType.GuildAnnouncement,
                )
                .setRequired(false),
            ),
        ),
    );
  }

  public async enable(ctx: CommandContext) {
    const channel = (await resolveChannelOption(ctx)) ?? resolveTargetChannel(ctx);
    if (!channel) {
      return ctx.replyError(
        "Invalid Channel",
        "This command can only target a text channel.",
      );
    }
    if (isChannelLocked(channel)) {
      return ctx.replyWarning("Already Locked", `${channel} is already locked.`);
    }
    await ctx.defer();
    await lockChannel(channel, formatAuditReason(ctx.user, "Channel locked"));
    return ctx.replySuccess(
      "Channel Locked",
      `${channel} is now locked - @everyone can no longer send messages there.`,
    );
  }

  public async disable(ctx: CommandContext) {
    const channel = (await resolveChannelOption(ctx)) ?? resolveTargetChannel(ctx);
    if (!channel) {
      return ctx.replyError(
        "Invalid Channel",
        "This command can only target a text channel.",
      );
    }
    if (!isChannelLocked(channel)) {
      return ctx.replyWarning("Not Locked", `${channel} isn't locked.`);
    }
    await ctx.defer();
    await unlockChannel(channel, formatAuditReason(ctx.user, "Channel unlocked"));
    return ctx.replySuccess(
      "Channel Unlocked",
      `${channel} is now unlocked - @everyone can send messages there again.`,
    );
  }
}

async function resolveChannelOption(
  ctx: CommandContext,
): Promise<LockableChannel | null> {
  const channel = await ctx.getChannel("channel");
  return isLockable(channel) ? channel : null;
}
