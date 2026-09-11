import type { LumiT } from "#lib/i18n/index.js";
import { LanguageKeys } from "#lib/i18n/keys.js";
import { ModerationCommand } from "#lib/moderation/ModerationCommand.js";
import { parseSnowflakeList, resolveMembers } from "#lib/moderation/multi-target.js";
import type { ConfirmPromptOptions } from "#lib/utilities/confirm.js";
import { ApplyOptions } from "@sapphire/decorators";
import { applyLocalizedBuilder } from "@sapphire/plugin-i18next";
import { userMention } from "@discordjs/formatters";
import type { ModerationCase } from "@prisma/client";
import type { AutocompleteInteraction, GuildMember } from "discord.js";
import { KickAction } from "../actions/index.js";
import { respondWithReasonChoices } from "../lib/reason-autocomplete.js";

const Root = LanguageKeys.Commands;

type Context = ModerationCommand.ActionContext<GuildMember>;
type Success = ModerationCommand.OutcomeContext<GuildMember, ModerationCase>;

@ApplyOptions<ModerationCommand.Options>({
  name: "kick",
  description: "Kick a member from the server",
  preconditions: ["GuildOnly"],
  requiredPermit: "mod.*",
  prefixEnabled: true,
  cooldownLimit: 3,
  cooldownDelay: 5000,
  logScope: "kick",
  duplicateCaseAction: "kick",
})
export class KickCommand extends ModerationCommand<
  GuildMember,
  ModerationCase
> {
  public override registerApplicationCommands(
    registry: ModerationCommand.Registry,
  ) {
    registry.registerChatInputCommand((b) =>
      applyLocalizedBuilder(b, "commands:kick")
        .addUserOption((o) =>
          applyLocalizedBuilder(o, "commands:kickMember").setRequired(false),
        )
        .addStringOption((o) =>
          applyLocalizedBuilder(o, "commands:kickMembers").setRequired(false),
        )
        .addStringOption((o) =>
          applyLocalizedBuilder(o, "commands:modReason").setAutocomplete(true),
        ),
    );
  }

  public override async autocompleteRun(
    interaction: AutocompleteInteraction,
  ): Promise<void> {
    return respondWithReasonChoices(interaction);
  }

  protected override async resolveTarget(ctx: ModerationCommand.RunContext) {
    if (!ctx.isSlash) return ctx.getMembers("member", { required: true });

    const single = await ctx.getMember("member");
    const extra = await ctx.getString("members");
    const ids = new Set(extra ? parseSnowflakeList(extra) : []);
    if (single) ids.add(single.id);
    if (ids.size === 0) return [];

    const resolved = await resolveMembers(ctx.guild!, [...ids]);
    return single && !resolved.some((m) => m.id === single.id)
      ? [single, ...resolved]
      : resolved;
  }

  protected override confirm(
    t: LumiT,
    { target, reason }: Context,
  ): ConfirmPromptOptions {
    return {
      title: t(Root.KickConfirmTitle),
      body: t(Root.KickConfirmBody, {
        user: userMention(target.id),
        reason,
      }),
      confirmLabel: t(Root.KickConfirmButton),
    };
  }

  protected override action({ guild, target, moderator, reason }: Context) {
    return KickAction.apply({ guild, targetMember: target, moderator, reason });
  }

  protected override buildSuccessMessage(
    t: LumiT,
    { target, reason, outcome }: Success,
  ) {
    return {
      title: t(Root.KickSuccessTitle),
      body: t(Root.KickSuccess, {
        user: target.user.username,
        reason,
        caseNumber: outcome.caseNumber,
      }),
    };
  }
}
