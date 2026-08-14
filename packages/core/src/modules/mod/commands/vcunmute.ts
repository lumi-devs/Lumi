import { ApplyOptions } from "@sapphire/decorators";
import { ApplicationCommandRegistry } from "@sapphire/framework";
import { BaseCommand, CommandContext } from "#lib/commands.js";
import { VoiceMuteAction } from "../actions/VoiceMuteAction.js";
import { resolveVoiceMember } from "../lib/helpers.js";

@ApplyOptions<BaseCommand.Options>({
  name: "vcunmute",
  aliases: ["voiceunmute", "vunmute"],
  description: "Unmute a member in server voice channels",
  preconditions: ["GuildOnly"],
  requiredPermit: "mod.voicemute",
  prefixEnabled: true,
})
export class VcUnmuteCommand extends BaseCommand {
  public override registerApplicationCommands(
    registry: ApplicationCommandRegistry,
  ) {
    registry.registerChatInputCommand((b) =>
      b
        .setName(this.name)
        .setDescription(this.description)
        .addUserOption((o) =>
          o
            .setName("target")
            .setDescription("Member to unmute in voice")
            .setRequired(true),
        )
        .addStringOption((o) =>
          o.setName("reason").setDescription("Reason for voice unmute"),
        ),
    );
  }

  public override async run(ctx: CommandContext): Promise<void> {
    const guild = ctx.guild!;
    const reason =
      (await ctx.getString("reason")) ?? "Voice unmute by moderator";

    const member = await resolveVoiceMember(ctx, guild);
    if (!member) return;

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
