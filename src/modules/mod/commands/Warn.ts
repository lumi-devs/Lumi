import type { CommandContext } from "#src/lib/commands/Context.js";
import type { Container } from "#src/lib/Services.js";
import { SlashCommandBuilder } from "discord.js";
import type { CommandDef } from "#src/lib/commands/CommandDef.js";
import type { LumiT } from "#src/lib/i18n/Index.js";
import { runModerationFlow, type ModerationCommand } from "#src/lib/commands/ModerationFlow.js";
import { applyLocalizedBuilder } from "#src/lib/i18n/Index.js";
import type { AutocompleteInteraction, GuildMember } from "discord.js";
import { WarnAction } from "#src/modules/mod/services/actions/WarnAction.js";
import { respondWithReasonChoices } from "#src/modules/mod/services/ReasonAutocomplete.js";

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
    ) as SlashCommandBuilder;
  },
  run: (ctx: CommandContext) => runModerationFlow(ctx, warnDefFlow),
  autocomplete: async (_services: Container, interaction: AutocompleteInteraction) =>
    respondWithReasonChoices(interaction),
};
