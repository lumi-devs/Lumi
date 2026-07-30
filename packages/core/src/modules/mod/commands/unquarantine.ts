import { ApplyOptions } from "@sapphire/decorators";
import { type ApplicationCommandRegistry } from "@sapphire/framework";
import { userMention } from "@discordjs/formatters";
import { BaseCommand, type CommandContext } from "#lib/commands.js";
import { logError } from "#lib/utilities/errors.js";
import { QuarantineAction } from "../actions/index.js";

@ApplyOptions<BaseCommand.Options>({
  name: "unquarantine",
  description: "Release a member from Anti-Nuke Quarantine",
  preconditions: ["GuildOnly"],
  requiredPermit: "mod.*",
  prefixEnabled: true,
})
export class UnquarantineCommand extends BaseCommand {
  public override registerApplicationCommands(registry: ApplicationCommandRegistry) {
    registry.registerChatInputCommand((b) =>
      b
        .setName(this.name)
        .setDescription(this.description)
        .addUserOption((o) =>
          o.setName("member").setDescription("The member to release").setRequired(true),
        )
        .addStringOption((o) =>
          o.setName("reason").setDescription("Reason for release").setRequired(false),
        ),
    );
  }

  public override async run(ctx: CommandContext) {
    await ctx.defer();
    const t = await ctx.fetchT();
    const member = await ctx.getMember("member");
    const reason =
      (await ctx.getString("reason", { rest: true })) ??
      t("commands:modNoReason");

    if (!member) {
      return ctx.replyError(
        t("commands:modMemberNotFoundTitle"),
        t("commands:modMemberNotFound"),
      );
    }

    const guild = ctx.guild!;
    try {
      await QuarantineAction.undo({
        guild,
        targetMember: member,
        moderator: ctx.user,
        reason,
      });
    } catch (err: unknown) {
      logError(`unquarantine: guild=${guild.id} target=${member.id}`, err);
      return ctx.replyError(
        t("commands:modActionFailedTitle"),
        t("commands:modActionFailed"),
      );
    }

    return ctx.replySuccess(
      "Unquarantine Successful",
      `Successfully released ${userMention(member.id)} from Quarantine.`,
    );
  }
}
