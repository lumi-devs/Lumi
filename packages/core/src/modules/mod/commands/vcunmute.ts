import { ApplyOptions } from "@sapphire/decorators";
import type { ApplicationCommandRegistry } from "@sapphire/framework";
import {
  ModerationCommand,
  type ModerationCommand as MC,
} from "#lib/moderation/ModerationCommand.js";
import { VoiceMuteAction } from "../actions/VoiceMuteAction.js";
import type { LumiT } from "#lib/i18n/index.js";
import type { ModerationCase } from "@prisma/client";
import type { GuildMember } from "discord.js";

@ApplyOptions<MC.Options>({
  name: "vcunmute",
  aliases: ["voiceunmute", "vunmute"],
  description: "Unmute a member in server voice channels",
  preconditions: ["GuildOnly"],
  requiredPermit: "mod.voicemute",
  prefixEnabled: true,
  logScope: "vcunmute",
})
export class VcUnmuteCommand extends ModerationCommand<
  GuildMember,
  ModerationCase
> {
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

  protected override resolveTarget(ctx: MC.RunContext) {
    return ctx.getMembers("target", { required: true });
  }

  protected override resolveReason(ctx: MC.RunContext) {
    return ctx
      .getString("reason")
      .then((r) => r ?? "Voice unmute by moderator");
  }

  protected override action({
    guild,
    target,
    moderator,
    reason,
  }: MC.ActionContext<GuildMember>) {
    return VoiceMuteAction.undo({ guild, targetMember: target, moderator, reason });
  }

  protected override buildSuccessMessage(
    _t: LumiT,
    { target, outcome }: MC.OutcomeContext<GuildMember, ModerationCase>,
  ) {
    return {
      title: "Voice Unmuted Member",
      body: `Successfully unmuted **${target.user.tag}** in voice.\n\n**Case:** #${outcome.caseNumber}`,
    };
  }
}
