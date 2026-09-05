import { ApplyOptions } from "@sapphire/decorators";
import { type ApplicationCommandRegistry, Result } from "@sapphire/framework";
import { applyLocalizedBuilder } from "@sapphire/plugin-i18next";
import {
  ModerationCommand,
  type ModerationCommand as MC,
} from "#lib/moderation/ModerationCommand.js";
import { LanguageKeys } from "#lib/i18n/keys.js";
import type { LumiT } from "#lib/i18n/index.js";
import type { GuildMember } from "discord.js";

const Root = LanguageKeys.Commands;
const DehoistRegex = /^[\x21-\x40\x5B-\x60\x7B-\x7E\s]+/u;

function sanitizeName(name: string): string {
  const dehoisted = name.replace(DehoistRegex, "").trim();
  return dehoisted.length >= 2 ? dehoisted : "Sanitized User";
}

interface SanitizeOutcome {
  before: string;
  after: string;
}

@ApplyOptions<MC.Options>({
  name: "sanitize",
  description: "Remove hoisting characters from a member's nickname",
  preconditions: ["GuildOnly"],
  requiredPermit: "mod.*",
  prefixEnabled: true,
  logScope: "sanitize",
})
export class SanitizeCommand extends ModerationCommand<
  GuildMember,
  SanitizeOutcome,
  string
> {
  public override registerApplicationCommands(
    registry: ApplicationCommandRegistry,
  ) {
    registry.registerChatInputCommand((b) =>
      applyLocalizedBuilder(b, "commands:sanitize").addUserOption((o) =>
        applyLocalizedBuilder(o, "commands:sanitizeMember").setRequired(true),
      ),
    );
  }

  protected override resolveTarget(ctx: MC.RunContext) {
    return ctx.getMembers("member", { required: true });
  }

  protected override resolveReason(): Promise<string> {
    return Promise.resolve("Sanitize: removed hoisting characters");
  }

  protected override preHandle(_ctx: MC.RunContext, t: LumiT, target: GuildMember) {
    const current = target.nickname ?? target.user.username;
    const sanitized = sanitizeName(current);
    if (sanitized === current) {
      return Result.err({
        title: t(Root.SanitizeNothingTitle),
        body: t(Root.SanitizeNothing, { user: target.user.username }),
      });
    }
    return Result.ok(sanitized);
  }

  protected override async action({
    target,
    prepared,
  }: MC.ActionContext<GuildMember, string>): Promise<SanitizeOutcome> {
    const before = target.nickname ?? target.user.username;
    await target.setNickname(prepared, "Sanitize: removed hoisting characters");
    return { before, after: prepared };
  }

  protected override buildSuccessMessage(
    t: LumiT,
    { target, outcome }: MC.OutcomeContext<GuildMember, SanitizeOutcome, string>,
  ) {
    return {
      title: t(Root.SanitizeSuccessTitle),
      body: t(Root.SanitizeSuccess, {
        user: target.user.username,
        before: outcome.before,
        after: outcome.after,
      }),
    };
  }
}
