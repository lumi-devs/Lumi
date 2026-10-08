import type { CommandContext } from "#lib/commands/context.js";
import { SlashCommandBuilder } from "discord.js";
import type { CommandDef } from "#lib/commands/command-def.js";
import type { LumiT } from "#lib/i18n/index.js";
import { runModerationFlow, type ModerationCommand } from "#lib/moderation/ModerationCommand.js";
import { applyLocalizedBuilder } from "#lib/i18n/index.js";
import type { GuildMember } from "discord.js";
import { NotesAction } from "@lumi/application/services/mod/actions/NotesAction.js";

const Root = "commands";

type Noted = Awaited<ReturnType<typeof NotesAction.apply>>;
type Context = ModerationCommand.ActionContext<GuildMember>;
type Success = ModerationCommand.OutcomeContext<GuildMember, Noted>;

const notesDefFlow: ModerationCommand.Flow<GuildMember, Noted> = {
  resolveTarget: (ctx: ModerationCommand.RunContext) => {
    return ctx.getMembers("member", { required: true });
  },
  action: ({ guild, target, moderator, reason }: Context) => {
    return NotesAction.apply({ guild, targetMember: target, moderator, reason });
  },
  buildSuccessMessage: (
    t: LumiT,
    { target, reason }: Success,
  ) => {
    return {
      title: t(`${Root}:notesSuccessTitle`),
      body: t(`${Root}:notesSuccess`, {
        user: target.user.username,
        reason,
      }),
    };
  }
};

export const notesDef: CommandDef = {
  name: "notes",
  description: "Add a staff-only note to a member",
  guildOnly: true,
  requiredPermit: "mod.notes",
  prefixEnabled: true,
  build: () => {
    const b = new SlashCommandBuilder().setName("notes");
    return (
    applyLocalizedBuilder(b, "commands:notes")
            .addUserOption((o) =>
              applyLocalizedBuilder(o, "commands:notesMember").setRequired(true),
            )
            .addStringOption((o) =>
              applyLocalizedBuilder(o, "commands:modReason").setRequired(true),
            )
    ) as SlashCommandBuilder;
  },
  run: (ctx: CommandContext) => runModerationFlow(ctx, notesDefFlow)
};
