import {
  runModerationFlow,
  type ModerationCommand as MC,
} from "#lib/moderation/ModerationCommand.js";
import { SlashCommandBuilder } from "discord.js";
import type { CommandDef } from "#lib/commands/command-def.js";
import type { CommandContext } from "#lib/command-context.js";
import { VoiceMuteAction } from "@lumi/application/services/mod/actions/VoiceMuteAction.js";
import { formatDuration, parseDuration } from "#lib/utilities/time.js";
import type { ModerationCase } from "@prisma/client";
import type { GuildMember } from "discord.js";
import { Result } from "@lumi/shared";

const DefaultDurationMs = 24 * 3600 * 1000;

type TimedFlow = MC.Flow<GuildMember, ModerationCase, number>;
type Flow = MC.Flow<GuildMember, ModerationCase>;

const VcMuteAdd: TimedFlow = {
  logScope: "vcmute add",
  resolveTarget: (ctx) => ctx.getMembers("target", { required: true }),
  preHandle: async (ctx) => {
    const durationStr = await ctx.getString("duration");
    const durationMs = durationStr
      ? parseDuration(durationStr)
      : DefaultDurationMs;
    if (!durationMs) {
      return Result.err({
        title: "Invalid Duration",
        body: "Provide a valid duration e.g. `1h`, `30m`, `1d`.",
      });
    }
    return Result.ok(durationMs);
  },
  confirm: (_t, { target, reason, prepared }) => ({
    title: "Confirm Voice Mute",
    body: `You're about to voice mute **${target.user.tag}** for **${formatDuration(prepared)}**.\n**Reason:** ${reason}`,
    confirmLabel: "I understand, voice mute them",
  }),
  action: ({ guild, target, moderator, reason, prepared }) =>
    VoiceMuteAction.apply({
      guild,
      targetMember: target,
      moderator,
      reason,
      durationMs: prepared,
    }),
  buildSuccessMessage: (_t, { target, reason, outcome }) => ({
    title: "Voice Muted Member",
    body: `Successfully voice muted **${target.user.tag}**.\n\n**Case:** #${outcome.caseNumber}\n**Reason:** ${reason}`,
  }),
};

const VcMuteRemove: Flow = {
  logScope: "vcmute remove",
  resolveTarget: (ctx) => ctx.getMembers("target", { required: true }),
  action: ({ guild, target, moderator, reason }) =>
    VoiceMuteAction.undo({ guild, targetMember: target, moderator, reason }),
  buildSuccessMessage: (_t, { target, outcome }) => ({
    title: "Voice Unmuted Member",
    body: `Successfully unmuted **${target.user.tag}** in voice.\n\n**Case:** #${outcome.caseNumber}`,
  }),
};

export const vcmuteDef: CommandDef = {
  name: "vcmute",
  aliases: ["voicemute", "vmute"],
  description: "Voice mute a member in server voice channels",
  guildOnly: true,
  requiredPermit: "mod.voiceMute",
  prefixEnabled: true,
  build: () => {
    const b = new SlashCommandBuilder().setName("vcmute");
    return (
      b
        .setName("vcmute")
        .setDescription("Voice mute a member in server voice channels")
        .addSubcommand((sub) =>
          sub
            .setName("add")
            .setDescription("Voice mute a member")
            .addUserOption((opt) =>
              opt
                .setName("target")
                .setDescription("Target member")
                .setRequired(true),
            )
            .addStringOption((opt) =>
              opt
                .setName("duration")
                .setDescription("Mute duration (e.g. 1h, 1d)"),
            )
            .addStringOption((opt) =>
              opt.setName("reason").setDescription("Mute reason"),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName("remove")
            .setDescription("Unmute a member in voice")
            .addUserOption((opt) =>
              opt
                .setName("target")
                .setDescription("Target member")
                .setRequired(true),
            )
            .addStringOption((opt) =>
              opt.setName("reason").setDescription("Unmute reason"),
            ),
        )
    );
  },
  handlers: {
    add: {
      run: (ctx: CommandContext) => runModerationFlow(ctx, VcMuteAdd),
      requiredPermit: "mod.voiceMute",
    },
    remove: {
      run: (ctx: CommandContext) => runModerationFlow(ctx, VcMuteRemove),
      requiredPermit: "mod.voiceMute",
    },
  },
  defaultSub: "add",
};
