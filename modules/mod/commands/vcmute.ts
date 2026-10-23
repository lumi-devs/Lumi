import { SlashCommandBuilder, userMention } from "discord.js";
import type { CommandDef } from "@lumi/module-kit";
import { formatDuration, parseDuration, Time } from "@lumi/foundation";
import { makeErrorCard, makeSuccessCard } from "@lumi/ui";
import { logModAction, notifyPunishedUser, recordCase } from "../services/case.ts";
import { resolveMemberTarget } from "../services/target.ts";

const DefaultDurationMs = Time.Day;

export const vcmuteCommand: CommandDef = {
  name: "vcmute",
  description: "Server-mute a member in voice channels.",
  module: "mod",
  guildOnly: true,
  prefix: true,
  permitNode: ["mod.voiceMute", "mod.vcmute"],
  build: () =>
    new SlashCommandBuilder()
      .setName("vcmute")
      .setDescription("Server-mute a member in voice channels.")
      .addSubcommand((sub) =>
        sub
          .setName("add")
          .setDescription("Voice mute a member")
          .addUserOption((option) =>
            option.setName("user").setDescription("Member to voice mute").setRequired(true),
          )
          .addStringOption((option) =>
            option.setName("duration").setDescription("Duration, e.g. 1h, 1d (default 24h)"),
          )
          .addStringOption((option) =>
            option.setName("reason").setDescription("Reason for the voice mute").setMaxLength(1_000),
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName("remove")
          .setDescription("Remove a voice mute")
          .addUserOption((option) =>
            option.setName("user").setDescription("Member to unmute").setRequired(true),
          )
          .addStringOption((option) =>
            option.setName("reason").setDescription("Reason for removing the mute").setMaxLength(1_000),
          ),
      ),
  async run(ctx) {
    const guild = ctx.guild;
    if (!guild) return ctx.reply(makeErrorCard("Server Only", "This command can only be used in a server."));

    const action = ctx.getSubcommand();
    if (action !== "add" && action !== "remove") {
      return ctx.reply(
        makeErrorCard("Usage", "Use `/vcmute add` or `/vcmute remove`."),
      );
    }

    const resolved = await resolveMemberTarget(ctx);
    if (resolved.error) return ctx.reply(resolved.error);

    const { user, member } = resolved.target;

    if (action === "remove") {
      const reason = (await ctx.getString("reason", { rest: true })) ?? "No reason provided";
      await ctx.defer();

      if (member.voice.channel) {
        await member.voice.setMute(false, `${reason} | By ${ctx.user.tag}`).catch(() => undefined);
      }

      await ctx.services.db.moderation.deactivateActiveCases(guild.id, user.id, "voice_mute");
      const modCase = await recordCase(ctx.services, guild.id, {
        userId: user.id,
        moderatorId: ctx.user.id,
        action: "unvoice_mute",
        reason,
      });
      await logModAction(ctx.services, guild, modCase);

      return ctx.reply(
        makeSuccessCard(
          "Voice Unmuted",
          `Removed the voice mute from ${userMention(user.id)} (Case **#${modCase.caseNumber}**).`,
        ),
      );
    }

    const durationRaw = await ctx.getString("duration");
    const durationMs = durationRaw ? parseDuration(durationRaw) : DefaultDurationMs;
    if (!durationMs || durationMs <= 0 || durationMs > 28 * Time.Day) {
      return ctx.reply(
        makeErrorCard("Invalid Duration", "Provide a duration between 1 second and 28 days."),
      );
    }

    const reason = (await ctx.getString("reason", { rest: true })) ?? "No reason provided";
    await ctx.defer();

    const modCase = await recordCase(ctx.services, guild.id, {
      userId: user.id,
      moderatorId: ctx.user.id,
      action: "voice_mute",
      duration: Math.floor(durationMs / 1_000),
      expiresAt: new Date(Date.now() + durationMs),
      reason,
    });

    const inVoice = Boolean(member.voice.channel);
    if (inVoice) {
      try {
        await member.voice.setMute(
          true,
          `${reason} | By ${ctx.user.tag} (Case #${modCase.caseNumber})`,
        );
      } catch (error) {
        await ctx.services.db.moderation.deleteCase(guild.id, modCase.caseNumber);
        return ctx.reply(
          makeErrorCard(
            "Voice Mute Failed",
            error instanceof Error ? error.message : "Discord rejected the voice mute.",
          ),
        );
      }
    }

    await notifyPunishedUser(ctx.services, guild, user, "voice mute", reason);
    await logModAction(ctx.services, guild, modCase);

    return ctx.reply(
      makeSuccessCard(
        "Member Voice Muted",
        `Voice muted ${userMention(user.id)} for **${formatDuration(durationMs)}** (Case **#${modCase.caseNumber}**).${
          inVoice ? "" : " They are not in voice right now; the mute applies when they join."
        }\n**Reason:** ${reason}`,
      ),
    );
  },
};
