import { ApplyOptions } from "@sapphire/decorators";
import {
  InteractionHandlerTypes,
} from "@sapphire/framework";
import {
  MessageFlags,
  type GuildMember,
  type ModalSubmitInteraction,
} from "discord.js";
import { fetchT } from "@sapphire/plugin-i18next";
import { ModuleInteractionHandler } from "#lib/interactions/ModuleInteractionHandler.js";
import { parseDuration } from "#lib/utilities/time.js";
import type { LumiT } from "#lib/i18n/index.js";
import {
  checkDuplicateCase,
  checkHierarchy,
  type DuplicateCaseCheckContext,
} from "#lib/moderation/ModerationCommand.js";
import { BanAction } from "#modules/mod/services/actions/BanAction.js";
import { KickAction } from "#modules/mod/services/actions/KickAction.js";
import { MuteAction } from "#modules/mod/services/actions/MuteAction.js";
import { QuarantineAction } from "#lib/moderation/QuarantineAction.js";
import { WarnAction } from "#modules/mod/services/actions/WarnAction.js";
import { PunishAuthorModalId } from "../constants.js";
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

@ApplyOptions<ModuleInteractionHandler.Options>({
  name: "punish-author-modal",
  interactionHandlerType: InteractionHandlerTypes.ModalSubmit,
  module: "mod",
})
export class PunishAuthorModalHandler extends ModuleInteractionHandler<
  ModalSubmitInteraction,
  { action: string; authorId: string }
> {
  public override parse(interaction: ModalSubmitInteraction) {
    const parsed = PunishAuthorModalId.parse(interaction.customId);
    if (!parsed || !(parsed.action in CaseActionFor)) return this.none();
    return this.some(parsed);
  }

  protected override async handle(
    interaction: ModalSubmitInteraction,
    { action, authorId }: { action: string; authorId: string },
  ): Promise<void> {
    const { guild } = interaction;
    if (!guild) return;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const moderator = interaction.user;
    const t = (await fetchT(interaction)) as unknown as LumiT;

    // Adapter satisfying DuplicateCaseCheckContext (HierarchyCheckContext +
    // ConfirmPromptContext) so this modal-driven flow enforces the exact same
    // hierarchy/duplicate-case checks runModerationFlow applies to the slash
    // commands, instead of calling the punishment action directly.
    const checkCtx: DuplicateCaseCheckContext = {
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
  }
}
