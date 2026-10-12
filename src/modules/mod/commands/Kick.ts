import type { CommandContext } from "#src/lib/commands/Context.js";
import type { Container } from "#src/lib/Services.js";
import { SlashCommandBuilder } from "discord.js";
import type { CommandDef } from "#src/lib/commands/CommandDef.js";
import type { LumiT } from "#src/lib/i18n/Index.js";
import { runModerationFlow, type ModerationCommand } from "#src/lib/api/moderation/ModerationFlow.js";
import { parseSnowflakeList, resolveMembers } from "#src/lib/discord/MassTargets.js";
import type { ConfirmPromptOptions } from "#src/lib/utilities/Confirm.js";
import { applyLocalizedBuilder } from "#src/lib/i18n/Index.js";
import { userMention } from "@discordjs/formatters";
import type { ModerationCase } from "@prisma/client";
import type { AutocompleteInteraction, GuildMember } from "discord.js";
import { KickAction } from "#src/modules/mod/services/actions/KickAction.js";
import { respondWithReasonChoices } from "#src/modules/mod/services/ReasonAutocomplete.js";

const Root = "commands";

type Context = ModerationCommand.ActionContext<GuildMember>;
type Success = ModerationCommand.OutcomeContext<GuildMember, ModerationCase>;

const kickDefFlow: ModerationCommand.Flow<GuildMember,
  ModerationCase> = {
  logScope: "kick",
  duplicateCaseAction: "kick",
  resolveTarget: async (ctx: ModerationCommand.RunContext) => {
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
  },
  confirm: (
    t: LumiT,
    { target, reason }: Context,
  ): ConfirmPromptOptions => {
    return {
      title: t(`${Root}:kickConfirmTitle`),
      body: t(`${Root}:kickConfirmBody`, {
        user: userMention(target.id),
        reason,
      }),
      confirmLabel: t(`${Root}:kickConfirmButton`),
    };
  },
  action: ({ guild, target, moderator, reason }: Context) =>
    KickAction.apply({ guild, targetMember: target, moderator, reason }),
  buildSuccessMessage: (
    t: LumiT,
    { target, reason, outcome }: Success,
  ) => ({
    title: t(`${Root}:kickSuccessTitle`),
    body: t(`${Root}:kickSuccess`, {
      user: target.user.username,
      reason,
      caseNumber: outcome.caseNumber,
    }),
  }),
};

export const kickDef: CommandDef = {
  name: "kick",
  description: "Kick a member from the server",
  guildOnly: true,
  requiredPermit: "mod.*",
  prefixEnabled: true,
  cooldownMs: 5000,
  build: () => {
    const b = new SlashCommandBuilder().setName("kick");
    return (
    applyLocalizedBuilder(b, "commands:kick")
            .addUserOption((o) =>
              applyLocalizedBuilder(o, "commands:kickMember").setRequired(false),
            )
            .addStringOption((o) =>
              applyLocalizedBuilder(o, "commands:kickMembers").setRequired(false),
            )
            .addStringOption((o) =>
              applyLocalizedBuilder(o, "commands:modReason").setAutocomplete(true),
            )
    );
  },
  run: (ctx: CommandContext) => runModerationFlow(ctx, kickDefFlow),
  autocomplete: async (_services: Container, interaction: AutocompleteInteraction) =>
    respondWithReasonChoices(interaction),
};
