import { ApplyOptions } from "@sapphire/decorators";
import { ApplicationCommandRegistry } from "@sapphire/framework";
import { BaseCommand, CommandContext } from "#lib/commands.js";
import { SoftbanAction } from "../actions/SoftbanAction.js";

@ApplyOptions<BaseCommand.Options>({
  name: "softban",
  aliases: ["sban"],
  description: "Softban a member (ban and immediately unban to clear recent messages)",
  preconditions: ["GuildOnly"],
  requiredPermit: "mod.softban",
  prefixEnabled: true,
})
export class SoftbanCommand extends BaseCommand {
  public override registerApplicationCommands(registry: ApplicationCommandRegistry) {
    registry.registerChatInputCommand((b) =>
      b
        .setName(this.name)
        .setDescription(this.description)
        .addUserOption((o) => o.setName("target").setDescription("Member to softban").setRequired(true))
        .addIntegerOption((o) =>
          o
            .setName("days")
            .setDescription("Days of messages to delete (1-7, default 1)")
            .setMinValue(1)
            .setMaxValue(7),
        )
        .addStringOption((o) => o.setName("reason").setDescription("Reason for softban")),
    );
  }

  public override async run(ctx: CommandContext): Promise<void> {
    const guild = ctx.guild!;
    const user = await ctx.getUser("target");
    const days = (await ctx.getInteger("days")) ?? 1;
    const reason = (await ctx.getString("reason")) ?? "Softban to purge recent message history.";

    if (!user) {
      return ctx.replyError("User Required", "Please specify a user to softban.");
    }

    const c = await SoftbanAction.apply({
      guild,
      targetUser: user,
      moderator: ctx.user,
      reason,
      deleteMessageDays: days,
    });

    await ctx.replySuccess(
      "Softbanned Member",
      `Successfully softbanned **${user.tag}** and purged **${days} day(s)** of message history.\n\n**Case:** #${c.caseNumber}`,
    );
  }
}
