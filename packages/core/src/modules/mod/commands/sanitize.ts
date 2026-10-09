import type { CommandContext } from "#lib/commands/context.js";
import { SlashCommandBuilder } from "discord.js";
import type { CommandDef } from "#lib/commands/command-def.js";
import { Result } from "@lumi/shared";
import { applyLocalizedBuilder } from "#lib/i18n/index.js";
import { runModerationFlow, type ModerationCommand as MC } from "#lib/moderation/ModerationCommand.js";
import type { LumiT } from "#lib/i18n/index.js";
import type { GuildMember } from "discord.js";

const Root = "commands";
const DehoistRegex = /^[\x21-\x40\x5B-\x60\x7B-\x7E\s]+/u;

function sanitizeName(name: string): string {
  const dehoisted = name.replace(DehoistRegex, "").trim();
  return dehoisted.length >= 2 ? dehoisted : "Sanitized User";
}

interface SanitizeOutcome {
  before: string;
  after: string;
}

const sanitizeDefFlow: MC.Flow<GuildMember,
  SanitizeOutcome,
  string> = {
  logScope: "sanitize",
  resolveTarget: (ctx: MC.RunContext) => {
    return ctx.getMembers("member", { required: true });
  },
  preHandle: (_ctx: MC.RunContext, t: LumiT, target: GuildMember) => {
    const current = target.nickname ?? target.user.username;
    const sanitized = sanitizeName(current);
    if (sanitized === current) {
      return Result.err({
        title: t(`${Root}:sanitizeNothingTitle`),
        body: t(`${Root}:sanitizeNothing`, { user: target.user.username }),
      });
    }
    return Result.ok(sanitized);
  },
  resolveReason: () => {
    return Promise.resolve("Sanitize: removed hoisting characters");
  },
  action: async ({
    target,
    prepared,
  }: MC.ActionContext<GuildMember, string>) => {
    const before = target.nickname ?? target.user.username;
    await target.setNickname(prepared, "Sanitize: removed hoisting characters");
    return { before, after: prepared };
  },
  buildSuccessMessage: (
    t: LumiT,
    { target, outcome }: MC.OutcomeContext<GuildMember, SanitizeOutcome, string>,
  ) => {
    return {
      title: t(`${Root}:sanitizeSuccessTitle`),
      body: t(`${Root}:sanitizeSuccess`, {
        user: target.user.username,
        before: outcome.before,
        after: outcome.after,
      }),
    };
  }
};

export const sanitizeDef: CommandDef = {
  name: "sanitize",
  description: "Remove hoisting characters from a member's nickname",
  guildOnly: true,
  requiredPermit: "mod.*",
  prefixEnabled: true,
  build: () => {
    const b = new SlashCommandBuilder().setName("sanitize");
    return (
    applyLocalizedBuilder(b, "commands:sanitize").addUserOption((o) =>
            applyLocalizedBuilder(o, "commands:sanitizeMember").setRequired(true),
          )
    ) as SlashCommandBuilder;
  },
  run: (ctx: CommandContext) => runModerationFlow(ctx, sanitizeDefFlow)
};
