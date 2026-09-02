import type { LumiT } from "#lib/i18n/index.js";
import { LanguageKeys } from "#lib/i18n/keys.js";
import { ModerationCommand } from "#lib/moderation/ModerationCommand.js";
import { ApplyOptions } from "@sapphire/decorators";
import { applyLocalizedBuilder } from "@sapphire/plugin-i18next";
import type { GuildMember } from "discord.js";
import { WarnAction } from "../actions/index.js";

const Root = LanguageKeys.Commands;

type Warned = Awaited<ReturnType<typeof WarnAction.apply>>;
type Context = ModerationCommand.ActionContext<GuildMember>;
type Success = ModerationCommand.OutcomeContext<GuildMember, Warned>;

@ApplyOptions<ModerationCommand.Options>({
  name: "warn",
  description: "Warn a member",
  preconditions: ["GuildOnly"],
  requiredPermit: "mod.*",
  prefixEnabled: true,
})
export class WarnCommand extends ModerationCommand<GuildMember, Warned> {
  public override registerApplicationCommands(
    registry: ModerationCommand.Registry,
  ) {
    registry.registerChatInputCommand((b) =>
      applyLocalizedBuilder(b, "commands:warn")
        .addUserOption((o) =>
          applyLocalizedBuilder(o, "commands:warnMember").setRequired(true),
        )
        .addStringOption((o) =>
          applyLocalizedBuilder(o, "commands:modReason").setRequired(false),
        ),
    );
  }

  protected override resolveTarget(ctx: ModerationCommand.RunContext) {
    return ctx.getMembers("member", { required: true });
  }

  protected override action({ guild, target, moderator, reason }: Context) {
    return WarnAction.apply({ guild, targetMember: target, moderator, reason });
  }

  protected override buildSuccessMessage(
    t: LumiT,
    { target, reason, outcome }: Success,
  ) {
    return {
      title: t(Root.WarnSuccessTitle),
      body: t(Root.WarnSuccess, {
        user: target.user.username,
        reason,
        caseNumber: outcome.caseRecord.caseNumber,
        count: outcome.warnCount,
      }),
    };
  }
}
