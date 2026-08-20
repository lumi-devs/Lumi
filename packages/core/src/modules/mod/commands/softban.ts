import { ApplyOptions } from "@sapphire/decorators";
import { ApplicationCommandRegistry, Result } from "@sapphire/framework";
import {
  ModerationCommand,
  type ModerationCommand as MC,
} from "#lib/moderation/ModerationCommand.js";
import { SoftbanAction } from "../actions/SoftbanAction.js";
import type { LumiT } from "#lib/i18n/index.js";
import type { ModerationCase } from "@prisma/client";
import type { User } from "discord.js";

@ApplyOptions<MC.Options>({
  name: "softban",
  aliases: ["sban"],
  description:
    "Softban a member (ban and immediately unban to clear recent messages)",
  preconditions: ["GuildOnly"],
  requiredPermit: "mod.softban",
  prefixEnabled: true,
  logScope: "softban",
})
export class SoftbanCommand extends ModerationCommand<
  User,
  ModerationCase,
  number
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
            .setDescription("Member to softban")
            .setRequired(true),
        )
        .addIntegerOption((o) =>
          o
            .setName("days")
            .setDescription("Days of messages to delete (1-7, default 1)")
            .setMinValue(1)
            .setMaxValue(7),
        )
        .addStringOption((o) =>
          o.setName("reason").setDescription("Reason for softban"),
        ),
    );
  }

  protected override resolveTarget(ctx: MC.RunContext) {
    return ctx.getUser("target");
  }

  protected override async preHandle(ctx: MC.RunContext) {
    const days = (await ctx.getInteger("days")) ?? 1;
    return Result.ok(days);
  }

  protected override resolveReason(ctx: MC.RunContext) {
    return ctx
      .getString("reason")
      .then((r) => r ?? "Softban to purge recent message history.");
  }

  protected override action({
    guild,
    target,
    moderator,
    reason,
    prepared,
  }: MC.ActionContext<User, number>) {
    return SoftbanAction.apply({
      guild,
      targetUser: target,
      moderator,
      reason,
      deleteMessageDays: prepared,
    });
  }

  protected override buildSuccessMessage(
    _t: LumiT,
    { target, prepared, outcome }: MC.OutcomeContext<User, ModerationCase, number>,
  ) {
    return {
      title: "Softbanned Member",
      body: `Successfully softbanned **${target.tag}** and purged **${prepared} day(s)** of message history.\n\n**Case:** #${outcome.caseNumber}`,
    };
  }
}
