import {
  runModerationFlow,
  type ModerationCommand as MC,
} from "#lib/moderation/ModerationCommand.js";
import type { Container } from "#lib/services.js";
import { formatDuration, parseDuration } from "#lib/utilities/time.js";
import { Ms } from "@lumi/shared";
import { Result } from "@lumi/shared";
import { SlashCommandBuilder } from "discord.js";
import type { CommandDef } from "#lib/commands/command-def.js";
import type { CommandContext } from "#lib/command-context.js";
import { applyLocalizedBuilder } from "#lib/i18n/index.js";
import { userMention } from "@discordjs/formatters";
import type { ModerationCase } from "@prisma/client";
import type { AutocompleteInteraction, GuildMember } from "discord.js";
import { MuteAction } from "@lumi/application/services/mod/actions/MuteAction.js";
import { respondWithReasonChoices } from "@lumi/application/services/mod/reason-autocomplete.js";

const Root = "commands";
const MaxTimeoutMs = 28 * Ms.Day;

type Flow = MC.Flow<GuildMember, ModerationCase>;
type TimedFlow = MC.Flow<GuildMember, ModerationCase, number>;

const TimeoutAdd: TimedFlow = {
  logScope: "timeout add",
  duplicateCaseAction: "mute",
  resolveTarget: (ctx) => ctx.getMembers("member", { required: true }),
  preHandle: async (ctx, t) => {
    const input = await ctx.getString("duration");
    const durationMs = input ? parseDuration(input) : null;
    if (!durationMs) {
      return Result.err({
        title: t(`${Root}:timeoutInvalidDurationTitle`),
        body: t(`${Root}:timeoutInvalidDuration`),
      });
    }
    if (durationMs > MaxTimeoutMs) {
      return Result.err({
        title: t(`${Root}:timeoutTooLongTitle`),
        body: t(`${Root}:timeoutTooLong`),
      });
    }
    return Result.ok(durationMs);
  },
  confirm: (t, { target, reason, prepared }) => ({
    title: t(`${Root}:timeoutConfirmTitle`),
    body: t(`${Root}:timeoutConfirmBody`, {
      user: userMention(target.id),
      duration: formatDuration(prepared),
      reason,
    }),
    confirmLabel: t(`${Root}:timeoutConfirmButton`),
  }),
  action: ({ guild, target, moderator, reason, prepared }) =>
    MuteAction.apply({
      guild,
      targetMember: target,
      moderator,
      reason,
      durationMs: prepared,
    }),
  buildSuccessMessage: (t, { target, reason, prepared, outcome }) => ({
    title: t(`${Root}:timeoutSuccessTitle`),
    body: t(`${Root}:timeoutSuccess`, {
      user: target.user.username,
      duration: formatDuration(prepared),
      reason,
      caseNumber: outcome.caseNumber,
    }),
  }),
};

const TimeoutRemove: Flow = {
  logScope: "timeout remove",
  resolveTarget: (ctx) => ctx.getMembers("member", { required: true }),
  action: ({ guild, target, moderator, reason }) =>
    MuteAction.undo({ guild, targetMember: target, moderator, reason }),
  buildSuccessMessage: (t, { target }) => ({
    title: t(`${Root}:timeoutRemovedTitle`),
    body: t(`${Root}:timeoutRemoved`, { user: target.user.username }),
  }),
};

export const timeoutDef: CommandDef = {
  name: "timeout",
  aliases: ["mute", "unmute"],
  aliasSub: { unmute: "remove" },
  description: "Timeout or untimeout a member",
  guildOnly: true,
  requiredPermit: "mod.*",
  prefixEnabled: true,
  build: () => {
    const b = new SlashCommandBuilder().setName("timeout");
    return (
      applyLocalizedBuilder(b, "commands:timeout")
        .addSubcommand((s) =>
          applyLocalizedBuilder(s, "commands:timeoutAdd")
            .addUserOption((o) =>
              applyLocalizedBuilder(o, "commands:timeoutMember").setRequired(
                true,
              ),
            )
            .addStringOption((o) =>
              applyLocalizedBuilder(o, "commands:timeoutDuration").setRequired(
                true,
              ),
            )
            .addStringOption((o) =>
              applyLocalizedBuilder(o, "commands:modReason")
                .setRequired(false)
                .setAutocomplete(true),
            ),
        )
        .addSubcommand((s) =>
          applyLocalizedBuilder(s, "commands:timeoutRemove")
            .addUserOption((o) =>
              applyLocalizedBuilder(o, "commands:timeoutMember").setRequired(
                true,
              ),
            )
            .addStringOption((o) =>
              applyLocalizedBuilder(o, "commands:modReason")
                .setRequired(false)
                .setAutocomplete(true),
            ),
        )
    );
  },
  handlers: {
    add: {
      run: (ctx: CommandContext) => runModerationFlow(ctx, TimeoutAdd),
      requiredPermit: "mod.timeout",
    },
    remove: {
      run: (ctx: CommandContext) => runModerationFlow(ctx, TimeoutRemove),
      requiredPermit: "mod.timeout",
    },
  },
  defaultSub: "add",
  autocomplete: (_services: Container, interaction: AutocompleteInteraction) => {
    return respondWithReasonChoices(interaction);
  },
};
