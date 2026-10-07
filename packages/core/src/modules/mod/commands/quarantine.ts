import {
  runModerationFlow,
  type ModerationCommand as MC,
} from "#lib/moderation/ModerationCommand.js";
import { SlashCommandBuilder } from "discord.js";
import type { Container } from "#lib/services.js";
import type { CommandDef } from "#lib/commands/command-def.js";
import type { CommandContext } from "#lib/command-context.js";
import { applyLocalizedBuilder } from "#lib/i18n/index.js";
import { userMention } from "@discordjs/formatters";
import type { ModerationCase } from "@prisma/client";
import type { AutocompleteInteraction, GuildMember } from "discord.js";
import { QuarantineAction } from "#lib/moderation/QuarantineAction.js";
import { respondWithReasonChoices } from "@lumi/application/services/mod/reason-autocomplete.js";

const Root = "commands";

type Flow = MC.Flow<GuildMember, ModerationCase>;

function isSentinel(error: unknown, message: string): boolean {
  return error instanceof Error && error.message === message;
}

const QuarantineAdd: Flow = {
  logScope: "quarantine add",
  duplicateCaseAction: "quarantine",
  resolveTarget: (ctx) => ctx.getMembers("member", { required: true }),
  confirm: (t, { target, reason }) => ({
    title: t(`${Root}:quarantineConfirmTitle`),
    body: t(`${Root}:quarantineConfirmBody`, {
      user: userMention(target.id),
      reason,
    }),
    confirmLabel: t(`${Root}:quarantineConfirmButton`),
  }),
  action: ({ guild, target, moderator, reason }) =>
    QuarantineAction.apply({ guild, targetMember: target, moderator, reason }),
  mapExpectedError: (t, error, { target }) => {
    if (isSentinel(error, "UNCONFIGURED")) {
      return {
        title: t(`${Root}:quarantineUnconfiguredTitle`),
        body: t(`${Root}:quarantineUnconfigured`),
      };
    }
    if (isSentinel(error, "ALREADY_QUARANTINED")) {
      return {
        title: t(`${Root}:quarantineAlreadyTitle`),
        body: t(`${Root}:quarantineAlready`, { user: target.user.username }),
      };
    }
    return null;
  },
  buildSuccessMessage: (t, { target, reason, outcome }) => ({
    title: t(`${Root}:quarantineSuccessTitle`),
    body: t(`${Root}:quarantineSuccess`, {
      user: target.user.username,
      reason,
      caseNumber: outcome.caseNumber,
    }),
  }),
};

const QuarantineRemove: Flow = {
  logScope: "quarantine remove",
  resolveTarget: (ctx) => ctx.getMembers("member", { required: true }),
  action: ({ guild, target, moderator, reason }) =>
    QuarantineAction.undo({ guild, targetMember: target, moderator, reason }),
  mapExpectedError: (t, error, { target }) =>
    isSentinel(error, "NOT_QUARANTINED")
      ? {
          title: t(`${Root}:quarantineNotTitle`),
          body: t(`${Root}:quarantineNot`, { user: target.user.username }),
        }
      : null,
  buildSuccessMessage: (t, { target, reason, outcome }) => ({
    title: t(`${Root}:quarantineReleasedTitle`),
    body: t(`${Root}:quarantineReleased`, {
      user: target.user.username,
      reason,
      caseNumber: outcome.caseNumber,
    }),
  }),
};

export const quarantineDef: CommandDef = {
  name: "quarantine",
  description: "Quarantine or release a member",
  guildOnly: true,
  requiredPermit: "mod.*",
  prefixEnabled: true,
  build: () => {
    const b = new SlashCommandBuilder().setName("quarantine");
    return (
      applyLocalizedBuilder(b, "commands:quarantine")
        .addSubcommand((s) =>
          applyLocalizedBuilder(s, "commands:quarantineAdd")
            .addUserOption((o) =>
              applyLocalizedBuilder(o, "commands:quarantineMember").setRequired(
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
          applyLocalizedBuilder(s, "commands:quarantineRemove")
            .addUserOption((o) =>
              applyLocalizedBuilder(o, "commands:quarantineMember").setRequired(
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
      run: (ctx: CommandContext) => runModerationFlow(ctx, QuarantineAdd),
      requiredPermit: "mod.quarantine",
    },
    remove: {
      run: (ctx: CommandContext) => runModerationFlow(ctx, QuarantineRemove),
      requiredPermit: "mod.quarantine",
    },
  },
  defaultSub: "add",
  autocomplete: (_services: Container, interaction: AutocompleteInteraction) => {
    return respondWithReasonChoices(interaction);
  },
};
