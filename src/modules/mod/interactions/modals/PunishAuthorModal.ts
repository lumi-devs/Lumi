import {
  MessageFlags,
  type GuildMember,
  type ModalSubmitInteraction,
} from "discord.js";
import { fetchT } from "#src/lib/i18n/Index.js";
import { defineInteraction } from "#src/lib/interactions/InteractionDef.js";
import { parseDuration } from "#src/lib/utilities/Time.js";
import type { Container } from "#src/lib/Services.js";
import {
  checkDuplicateCase,
  checkHierarchy,
  type DuplicateCaseCheckContext,
} from "#src/lib/commands/ModerationFlow.js";
import { BanAction } from "#src/modules/mod/services/actions/BanAction.js";
import { KickAction } from "#src/modules/mod/services/actions/KickAction.js";
import { MuteAction } from "#src/modules/mod/services/actions/MuteAction.js";
import { QuarantineAction } from "#src/lib/moderation/Quarantine.js";
import { WarnAction } from "#src/modules/mod/services/actions/WarnAction.js";
import { PunishAuthorModalId } from "#src/modules/mod/Constants.js";
import type { CaseAction } from "@prisma/client";

const DefaultReason = "No reason provided.";

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

    const checkCtx: DuplicateCaseCheckContext = {
      services,
      guild,
      member: interaction.member as GuildMember | null,
      user: moderator,
      isSlash: true,
      interaction,
    };

    const outranked = await checkHierarchy(checkCtx, authorId, t);
    if (outranked) {
      await interaction.editReply(`**${outranked.title}**\n${outranked.body}`);
      return;
    }

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
