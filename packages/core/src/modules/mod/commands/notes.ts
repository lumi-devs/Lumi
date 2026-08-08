import type { LumiT } from "#lib/i18n/index.js";
import { LanguageKeys } from "#lib/i18n/keys.js";
import { ModerationCommand } from "#lib/moderation/ModerationCommand.js";
import { ApplyOptions } from "@sapphire/decorators";
import { applyLocalizedBuilder } from "@sapphire/plugin-i18next";
import type { GuildMember } from "discord.js";
import { NotesAction } from "../actions/index.js";

const Root = LanguageKeys.Commands;

type Noted = Awaited<ReturnType<typeof NotesAction.apply>>;
type Context = ModerationCommand.ActionContext<GuildMember>;
type Success = ModerationCommand.OutcomeContext<GuildMember, Noted>;

@ApplyOptions<ModerationCommand.Options>({
  name: "notes",
  description: "Add a staff-only note to a member",
  preconditions: ["GuildOnly"],
  requiredPermit: "mod.notes",
  prefixEnabled: true,
})
export class NotesCommand extends ModerationCommand<GuildMember, Noted> {
  public override registerApplicationCommands(
    registry: ModerationCommand.Registry,
  ) {
    registry.registerChatInputCommand((b) =>
      applyLocalizedBuilder(b, "commands:notes")
        .addUserOption((o) =>
          applyLocalizedBuilder(o, "commands:notesMember").setRequired(true),
        )
        .addStringOption((o) =>
          applyLocalizedBuilder(o, "commands:modReason").setRequired(true),
        ),
    );
  }

  protected override resolveTarget(ctx: ModerationCommand.RunContext) {
    return ctx.getMember("member");
  }

  protected override action({ guild, target, moderator, reason }: Context) {
    return NotesAction.apply({ guild, targetMember: target, moderator, reason });
  }

  protected override buildSuccessMessage(
    t: LumiT,
    { target, reason }: Success,
  ) {
    return {
      title: t(Root.NotesSuccessTitle),
      body: t(Root.NotesSuccess, {
        user: target.user.username,
        reason,
      }),
    };
  }
}
