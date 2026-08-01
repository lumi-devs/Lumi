import { ApplyOptions } from "@sapphire/decorators";
import { ApplicationCommandRegistry } from "@sapphire/framework";
import { isNullish } from "@sapphire/utilities";
import { BaseSubcommand, CommandContext } from "#lib/commands.js";
import { VoiceMuteAction } from "../actions/VoiceMuteAction.js";
import { parseDuration } from "#lib/utilities/time.js";

@ApplyOptions<BaseSubcommand.Options>({
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
export class VcMuteCommand extends BaseSubcommand {
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

  public async add(ctx: CommandContext): Promise<void> {
    const guild = ctx.guild!;
    const user = await ctx.getUser("target");
    const durationStr = await ctx.getString("duration");
    const reason = (await ctx.getString("reason")) ?? "No reason provided.";

    if (isNullish(user)) {
      return ctx.replyError("User Required", "Please specify a target user.");
    }

    const member = await guild.members.fetch(user.id).catch(() => null);
    if (isNullish(member)) {
      return ctx.replyError(
        "Member Not Found",
        "That user is not in this server.",
      );
    }

    const durationMs = durationStr
      ? parseDuration(durationStr)
      : 24 * 3600 * 1000;
    if (!durationMs) {
      return ctx.replyError(
        "Invalid Duration",
        "Provide a valid duration e.g. `1h`, `30m`, `1d`.",
      );
    }

    const c = await VoiceMuteAction.apply({
      guild,
      targetMember: member,
      moderator: ctx.user,
      reason,
      durationMs,
    });

    await ctx.replySuccess(
      "Voice Muted Member",
      `Successfully voice muted **${member.user.tag}**.\n\n**Case:** #${c.caseNumber}\n**Reason:** ${reason}`,
    );
  }

  public async remove(ctx: CommandContext): Promise<void> {
    const guild = ctx.guild!;
    const user = await ctx.getUser("target");
    const reason =
      (await ctx.getString("reason")) ?? "Voice unmute by moderator";

    if (!user) {
      return ctx.replyError("User Required", "Please specify a target user.");
    }

    const member = await guild.members.fetch(user.id).catch(() => null);
    if (!member) {
      return ctx.replyError(
        "Member Not Found",
        "That user is not in this server.",
      );
    }

    const c = await VoiceMuteAction.undo({
      guild,
      targetMember: member,
      moderator: ctx.user,
      reason,
    });

    await ctx.replySuccess(
      "Voice Unmuted Member",
      `Successfully unmuted **${member.user.tag}** in voice.\n\n**Case:** #${c.caseNumber}`,
    );
  }
}
