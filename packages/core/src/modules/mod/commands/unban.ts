import type { LumiT } from "#lib/i18n/index.js";
import { LanguageKeys } from "#lib/i18n/keys.js";
import { ModerationCommand } from "#lib/moderation/ModerationCommand.js";
import { ApplyOptions } from "@sapphire/decorators";
import { Result } from "@sapphire/framework";
import { userMention } from "@discordjs/formatters";
import type { ModerationCase } from "@prisma/client";
import { BanAction } from "../actions/index.js";

const Root = LanguageKeys.Commands;
const UserIdPattern = /^\d{17,20}$/;

type Context = ModerationCommand.ActionContext<string>;
type Success = ModerationCommand.OutcomeContext<string, ModerationCase>;

@ApplyOptions<ModerationCommand.Options>({
  name: "unban",
  description: "Unban a user from the server",
  preconditions: ["GuildOnly"],
  requiredPermit: "mod.*",
  prefixEnabled: true,
  cooldownLimit: 3,
  cooldownDelay: 5000,
  logScope: "unban",
})
export class UnbanCommand extends ModerationCommand<string, ModerationCase> {
  public override registerApplicationCommands(
    registry: ModerationCommand.Registry,
  ) {
    registry.registerChatInputCommand((b) =>
      b
        .setName(this.name)
        .setDescription(this.description)
        .addStringOption((o) =>
          o
            .setName("user_id")
            .setDescription("User ID or mention to unban")
            .setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName("reason")
            .setDescription("Reason for unbanning")
            .setRequired(false),
        ),
    );
  }

  protected override async resolveTarget(ctx: ModerationCommand.RunContext) {
    const raw = await ctx.getString("user_id", { required: true });
    return raw!.replace(/\D/g, "");
  }

  protected override preHandle(
    _ctx: ModerationCommand.RunContext,
    t: LumiT,
    target: string,
  ) {
    if (UserIdPattern.test(target)) return Result.ok(null);
    return Result.err({
      title: t(Root.BanInvalidIdTitle),
      body: t(Root.BanInvalidId),
    });
  }

  protected override action({ guild, target, moderator, reason }: Context) {
    return BanAction.undo({ guild, targetId: target, moderator, reason });
  }

  protected override buildFailureMessage(t: LumiT) {
    return {
      title: t(Root.ModActionFailedTitle),
      body: t(Root.BanRemoveFailed),
    };
  }

  protected override buildSuccessMessage(t: LumiT, { target }: Success) {
    return {
      title: t(Root.BanRemoveSuccessTitle),
      body: t(Root.BanRemoveSuccess, { user: userMention(target) }),
    };
  }
}
