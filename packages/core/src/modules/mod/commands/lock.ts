import type { CommandDef } from "#lib/commands/command-def.js";
import type { CommandContext } from "#lib/command-context.js";
import {
  isChannelLocked,
  lockChannel,
  unlockChannel,
  type LockableChannel,
} from "#lib/moderation/lockdown.js";
import { formatAuditReason } from "#lib/utilities/misc.js";
import { SlashCommandBuilder, ChannelType } from "discord.js";

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

async function resolveChannelOption(
  ctx: CommandContext,
): Promise<LockableChannel | null> {
  const channel = await ctx.getChannel("channel");
  return isLockable(channel) ? channel : null;
}

export const lockDef: CommandDef = {
  name: "lock",
  description: "Lock or unlock one channel, unlike /lockdown which covers the whole server",
  guildOnly: true,
  requiredPermit: "mod.lockdown",
  prefixEnabled: true,
  build: () => {
    const b = new SlashCommandBuilder().setName("lock");
    return (
    b
            .setName("lock")
            .setDescription("Lock or unlock one channel, unlike /lockdown which covers the whole server")
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
            )
    );
  },
  handlers: {
  "enable": async (ctx: CommandContext) => {
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
      `${channel} is now locked - @everyone can no longer send messages there.`
    );
  },
  "disable": async (ctx: CommandContext) => {
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
  },
  defaultSub: "enable"
};
