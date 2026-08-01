import type { LumiT } from "#lib/i18n/index.js";
import { ModerationCommand } from "#lib/moderation/ModerationCommand.js";
import { ApplyOptions } from "@sapphire/decorators";
import { userMention } from "@discordjs/formatters";
import type { ModerationCase } from "@prisma/client";
import type { GuildMember } from "discord.js";
import { QuarantineAction } from "../actions/index.js";

type Context = ModerationCommand.ActionContext<GuildMember>;
type Success = ModerationCommand.OutcomeContext<GuildMember, ModerationCase>;

@ApplyOptions<ModerationCommand.Options>({
  name: "unquarantine",
  description: "Release a member from Anti-Nuke Quarantine",
  preconditions: ["GuildOnly"],
  requiredPermit: "mod.*",
  prefixEnabled: true,
  logScope: "unquarantine",
})
export class UnquarantineCommand extends ModerationCommand<
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
            .setDescription("The member to release")
            .setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName("reason")
            .setDescription("Reason for release")
            .setRequired(false),
        ),
    );
  }

  protected override resolveTarget(ctx: ModerationCommand.RunContext) {
    return ctx.getMember("member");
  }

  protected override action({ guild, target, moderator, reason }: Context) {
    return QuarantineAction.undo({
      guild,
      targetMember: target,
      moderator,
      reason,
    });
  }

  protected override buildSuccessMessage(_t: LumiT, { target }: Success) {
    return {
      title: "Unquarantine Successful",
      body: `Successfully released ${userMention(target.id)} from Quarantine.`,
    };
  }
}
