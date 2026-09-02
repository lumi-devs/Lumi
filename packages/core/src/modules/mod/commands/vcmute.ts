import { ApplyOptions } from "@sapphire/decorators";
import { ApplicationCommandRegistry, Result } from "@sapphire/framework";
import { ModerationSubcommand } from "#lib/moderation/ModerationSubcommand.js";
import { VoiceMuteAction } from "../actions/VoiceMuteAction.js";
import { formatDuration, parseDuration } from "#lib/utilities/time.js";
import type { ModerationCase } from "@prisma/client";
import type { GuildMember } from "discord.js";

const DEFAULT_DURATION_MS = 24 * 3600 * 1000;

type TimedFlow = ModerationSubcommand.Flow<GuildMember, ModerationCase, number>;
type Flow = ModerationSubcommand.Flow<GuildMember, ModerationCase>;

const VcMuteAdd: TimedFlow = {
  logScope: "vcmute add",
  resolveTarget: (ctx) => ctx.getMembers("target", { required: true }),
  preHandle: async (ctx) => {
    const durationStr = await ctx.getString("duration");
    const durationMs = durationStr
      ? parseDuration(durationStr)
      : DEFAULT_DURATION_MS;
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

@ApplyOptions<ModerationSubcommand.Options>({
  name: "vcmute",
  aliases: ["voicemute", "vmute"],
  description: "Voice mute a member in server voice channels",
  preconditions: ["GuildOnly"],
  requiredPermit: "mod.voicemute",
  prefixEnabled: true,
  subcommands: [
    { name: "add", run: "add", default: true },
    { name: "remove", run: "remove" },
  ],
})
export class VcMuteCommand extends ModerationSubcommand {
  public override registerApplicationCommands(
    registry: ApplicationCommandRegistry,
  ) {
    registry.registerChatInputCommand(
      (builder) =>
        builder
          .setName(this.name)
          .setDescription(this.description)
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
          ),
      { guildIds: [] },
    );
  }

  public add(ctx: ModerationSubcommand.RunContext) {
    return this.runFlow(ctx, VcMuteAdd);
  }

  public remove(ctx: ModerationSubcommand.RunContext) {
    return this.runFlow(ctx, VcMuteRemove);
  }
}
