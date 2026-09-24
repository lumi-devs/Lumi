import { ModerationSubcommand } from "#lib/moderation/ModerationSubcommand.js";
import { ApplyOptions } from "@sapphire/decorators";
import { applyLocalizedBuilder } from "@sapphire/plugin-i18next";
import { userMention } from "@discordjs/formatters";
import type { ModerationCase } from "@prisma/client";
import type { AutocompleteInteraction, GuildMember } from "discord.js";
import { QuarantineAction } from "#lib/moderation/QuarantineAction.js";
import { respondWithReasonChoices } from "../services/reason-autocomplete.js";

const Root = "commands";

type Flow = ModerationSubcommand.Flow<GuildMember, ModerationCase>;

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

@ApplyOptions<ModerationSubcommand.Options>({
  name: "quarantine",
  description: "Quarantine or release a member",
  preconditions: ["GuildOnly"],
  requiredPermit: "mod.*",
  prefixEnabled: true,
  subcommands: [
    { name: "add", run: "add", default: true },
    { name: "remove", run: "remove" },
  ],
})
export class QuarantineCommand extends ModerationSubcommand {
  public override registerApplicationCommands(
    registry: ModerationSubcommand.Registry,
  ) {
    registry.registerChatInputCommand((b) =>
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
        ),
    );
  }

  public override async autocompleteRun(
    interaction: AutocompleteInteraction,
  ): Promise<void> {
    return respondWithReasonChoices(interaction);
  }

  public add(ctx: ModerationSubcommand.RunContext) {
    return this.runFlow(ctx, QuarantineAdd);
  }

  public remove(ctx: ModerationSubcommand.RunContext) {
    return this.runFlow(ctx, QuarantineRemove);
  }
}
