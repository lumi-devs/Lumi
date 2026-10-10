import {
  MessageFlags,
  type GuildMember,
  type ModalSubmitInteraction,
} from "discord.js";
import { fetchT } from "@lumi/lib/i18n/index.js";
import { defineInteraction } from "@lumi/lib/interactions/interaction-def.js";
import { parseDuration } from "@lumi/lib/utilities/time.js";
import type { Container } from "@lumi/lib/services.js";
import {
  checkDuplicateCase,
  checkHierarchy,
  type DuplicateCaseCheckContext,
} from "@lumi/lib/commands/moderation-flow.js";
import { BanAction } from "@lumi/application/services/mod/actions/ban-action.js";
import { KickAction } from "@lumi/application/services/mod/actions/kick-action.js";
import { MuteAction } from "@lumi/application/services/mod/actions/mute-action.js";
import { QuarantineAction } from "@lumi/application/services/mod/actions/quarantine-action.js";
import { WarnAction } from "@lumi/application/services/mod/actions/warn-action.js";
import { PunishAuthorModalId } from "../../constants.js";
import type { CaseAction } from "@prisma/client";

const DefaultReason = "No reason provided.";

/** The moderation-case `action` string each quick-punish choice maps to, for the duplicate-case window check. */
const CaseActionFor: Record<string, CaseAction> = {
  ban: "ban",
  kick: "kick",
  warn: "warn",
  quarantine: "quarantine",
  timeout: "mute",
};

export const punishAuthorModal = defineInteraction({
  prefix: PunishAuthorModalId.prefix,
  module: "mod",
  async run(services: Container, interaction: ModalSubmitInteraction): Promise<void> {
    const parsed = PunishAuthorModalId.parse(interaction.customId);
    if (!parsed || !(parsed.action in CaseActionFor)) return;
    const { action, authorId } = parsed;
    const guildId = interaction.guildId ?? interaction.guild?.id ?? null;
    if (!guildId) return;
    if (!(await services.db.modules.isModuleEnabled(guildId, "mod"))) return;

    const { guild } = interaction;
    if (!guild) return;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const moderator = interaction.user;
    const t = await fetchT(interaction, services);

    // Adapter satisfying DuplicateCaseCheckContext (HierarchyCheckContext +
    // ConfirmPromptContext) so this modal-driven flow enforces the exact same
    // hierarchy/duplicate-case checks runModerationFlow applies to the slash
    // commands, instead of calling the punishment action directly.
    const checkCtx: DuplicateCaseCheckContext = {
      services,
      guild,
      member: interaction.member as GuildMember | null,
      user: moderator,
      isSlash: true,
      interaction,
    };

    // Same boundary every slash moderation command enforces: a mod cannot act
    // on someone who outranks (or ties) them, regardless of which UI path
    // they used to trigger the action.
    const outranked = await checkHierarchy(checkCtx, authorId, t);
    if (outranked) {
      await interaction.editReply(`**${outranked.title}**\n${outranked.body}`);
      return;
    }

    // Same "did we already case this?" guard the slash commands show before
    // applying the action - a Cancel here ends the run without punishing.
    const proceed = await checkDuplicateCase(
      checkCtx,
      t,
      authorId,
      CaseActionFor[action]!,
    );
    if (!proceed) {
      await interaction.editReply("Cancelled.");
      return;
    }

    let reason: string;
    try {
      reason = interaction.fields.getTextInputValue("reason").trim() || DefaultReason;
    } catch {
      reason = DefaultReason;
    }

    try {
      if (action === "ban") {
        const user = await interaction.client.users.fetch(authorId);
        await BanAction.apply({ guild, targetUser: user, moderator, reason });
      } else {
        const member = await guild.members.fetch(authorId).catch(() => null);
        if (!member) {
          await interaction.editReply(
            "That member is no longer in this server.",
          );
          return;
        }

        if (action === "kick") {
          await KickAction.apply({ guild, targetMember: member, moderator, reason });
        } else if (action === "warn") {
          await WarnAction.apply({ guild, targetMember: member, moderator, reason });
        } else if (action === "quarantine") {
          await QuarantineAction.apply({ guild, targetMember: member, moderator, reason });
        } else if (action === "timeout") {
          const raw = interaction.fields.getTextInputValue("duration");
          const durationMs = parseDuration(raw);
          if (!durationMs) {
            await interaction.editReply("Invalid duration.");
            return;
          }
          await MuteAction.apply({
            guild,
            targetMember: member,
            moderator,
            reason,
            durationMs,
          });
        } else {
          return;
        }
      }
    } catch {
      await interaction.editReply(
        "Could not complete the action. Check the bot's permissions and role hierarchy.",
      );
      return;
    }

    await interaction.editReply(`Applied **${action}** to <@${authorId}>.`);
  },
});
