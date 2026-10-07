import type { CommandContext } from "#lib/command-context.js";
import type { Container } from "#lib/services.js";
import { SlashCommandBuilder } from "discord.js";
import type { CommandDef } from "#lib/commands/command-def.js";
import type { LumiT } from "#lib/i18n/index.js";
import { runModerationFlow, type ModerationCommand } from "#lib/moderation/ModerationCommand.js";
import { applyLocalizedBuilder } from "#lib/i18n/index.js";
import type { AutocompleteInteraction, GuildMember } from "discord.js";
import { WarnAction } from "@lumi/application/services/mod/actions/WarnAction.js";
import { respondWithReasonChoices } from "@lumi/application/services/mod/reason-autocomplete.js";

const Root = "commands";

type Warned = Awaited<ReturnType<typeof WarnAction.apply>>;
type Context = ModerationCommand.ActionContext<GuildMember>;
type Success = ModerationCommand.OutcomeContext<GuildMember, Warned>;

const warnDefFlow: ModerationCommand.Flow<GuildMember, Warned> = {
  duplicateCaseAction: "warn",
  resolveTarget: (ctx: ModerationCommand.RunContext) => {
    return ctx.getMembers("member", { required: true });
  },
  action: ({ guild, target, moderator, reason }: Context) => {
    return WarnAction.apply({ guild, targetMember: target, moderator, reason });
  },
  buildSuccessMessage: (
    t: LumiT,
    { target, reason, outcome }: Success,
  ) => {
    return {
      title: t(`${Root}:warnSuccessTitle`),
      body: t(`${Root}:warnSuccess`, {
        user: target.user.username,
        reason,
        caseNumber: outcome.caseRecord.caseNumber,
        count: outcome.warnCount,
      }),
    };
  }
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
  autocomplete: async (_services: Container, interaction: AutocompleteInteraction,) => {
    return respondWithReasonChoices(interaction);
  },
};
