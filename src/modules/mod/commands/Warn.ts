import type { CommandContext } from "@commands/Context.js";
import type { Container } from "@lib/Services.js";
import { SlashCommandBuilder } from "discord.js";
import type { CommandDef } from "@commands/CommandDef.js";
import type { LumiT } from "@i18n/Index.js";
import { runModerationFlow, type ModerationCommand } from "@api/moderation/ModerationFlow.js";
import { applyLocalizedBuilder } from "@i18n/Index.js";
import type { AutocompleteInteraction, GuildMember } from "discord.js";
import { WarnAction } from "@modules/mod/services/actions/WarnAction.js";
import { respondWithReasonChoices } from "@modules/mod/services/ReasonAutocomplete.js";

const Root = "commands";

type Warned = Awaited<ReturnType<typeof WarnAction.apply>>;
type Context = ModerationCommand.ActionContext<GuildMember>;
type Success = ModerationCommand.OutcomeContext<GuildMember, Warned>;

const warnDefFlow: ModerationCommand.Flow<GuildMember, Warned> = {
  duplicateCaseAction: "warn",
  resolveTarget: (ctx: ModerationCommand.RunContext) =>
    ctx.getMembers("member", { required: true }),
  action: ({ guild, target, moderator, reason }: Context) =>
    WarnAction.apply({ guild, targetMember: target, moderator, reason }),
  buildSuccessMessage: (
    t: LumiT,
    { target, reason, outcome }: Success,
  ) => ({
    title: t(`${Root}:warnSuccessTitle`),
    body: t(`${Root}:warnSuccess`, {
      user: target.user.username,
      reason,
      caseNumber: outcome.caseRecord.caseNumber,
      count: outcome.warnCount,
    }),
  }),
};

export const warnDef: CommandDef = {
  name: "warn",
  description: "Warn a member",
  guildOnly: true,
  requiredPermit: "mod.*",
  prefixEnabled: true,
  build: () => {
    const b = new SlashCommandBuilder().setName("warn");
    return (
    applyLocalizedBuilder(b, "commands:warn")
            .addUserOption((o) =>
              applyLocalizedBuilder(o, "commands:warnMember").setRequired(true),
            )
            .addStringOption((o) =>
              applyLocalizedBuilder(o, "commands:modReason")
                .setRequired(false)
                .setAutocomplete(true),
            )
    );
  },
  run: (ctx: CommandContext) => runModerationFlow(ctx, warnDefFlow),
  autocomplete: async (_services: Container, interaction: AutocompleteInteraction) =>
    respondWithReasonChoices(interaction),
};
