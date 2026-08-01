import type { LumiT } from "#lib/i18n/index.js";
import { ModerationCommand } from "#lib/moderation/ModerationCommand.js";
import { ApplyOptions } from "@sapphire/decorators";
import { userMention } from "@discordjs/formatters";
import type { ModerationCase } from "@prisma/client";
import type { GuildMember } from "discord.js";
import { MuteAction } from "../actions/index.js";

type Context = ModerationCommand.ActionContext<GuildMember>;
type Success = ModerationCommand.OutcomeContext<GuildMember, ModerationCase>;

@ApplyOptions<ModerationCommand.Options>({
  name: "untimeout",
  aliases: ["unmute"],
  description: "Remove timeout/unmute a member in the server",
  preconditions: ["GuildOnly"],
  requiredPermit: "mod.*",
  prefixEnabled: true,
  logScope: "untimeout",
})
export class UntimeoutCommand extends ModerationCommand<
  GuildMember,
  ModerationCase
> {
  public override registerApplicationCommands(
    registry: ModerationCommand.Registry,
  ) {
    registry.registerChatInputCommand((b) =>
      b
        .setName(this.name)
        .setDescription(this.description)
        .addUserOption((o) =>
          o
            .setName("member")
            .setDescription("The member to untimeout")
            .setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName("reason")
            .setDescription("Reason for untimeout")
            .setRequired(false),
        ),
    );
  }

  protected override resolveTarget(ctx: ModerationCommand.RunContext) {
    return ctx.getMember("member");
  }

  protected override action({ guild, target, moderator, reason }: Context) {
    return MuteAction.undo({ guild, targetMember: target, moderator, reason });
  }

  protected override buildSuccessMessage(_t: LumiT, { target }: Success) {
    return {
      title: "Unmute Successful",
      body: `Successfully untimed out/unmuted ${userMention(target.id)}.`,
    };
  }
}
