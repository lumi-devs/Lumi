import {
  InteractionHandler,
  InteractionHandlerTypes,
} from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import { MessageFlags, type ButtonInteraction } from "discord.js";
import { BaseInteractionHandler } from "#lib/interaction-handler.js";
import { fetchTyped } from "#lib/commands.js";
import { getUtility } from "#lib/module-system/Utility.js";
import { PanelsKeys } from "#lib/i18n/keys.js";
import { getDashboardPublicUrl } from "#lib/env.js";
import {
  ephemeralCard,
  makeErrorCard,
  makeSuccessCard,
} from "#lib/utilities/cards.js";
import { CaptchaButtonPrefix } from "../lib/captcha.js";
import {
  VerifyButtonId,
  buildChallengeCard,
  buildProgressCard,
  buildWebPromptCard,
  buildWrongCard,
} from "../lib/verify-panel.js";

type Parsed = { kind: "start" } | { kind: "step"; idx: number };

@ApplyOptions<InteractionHandler.Options>({
  name: "security-verify",
  interactionHandlerType: InteractionHandlerTypes.Button,
})
export class VerifyInteractionHandler extends BaseInteractionHandler {
  public override parse(interaction: ButtonInteraction) {
    if (interaction.customId === VerifyButtonId) {
      return this.some<Parsed>({ kind: "start" });
    }
    if (interaction.customId.startsWith(`${CaptchaButtonPrefix}:`)) {
      const idx = Number.parseInt(interaction.customId.split(":")[2] ?? "", 10);
      if (Number.isNaN(idx)) return this.none();
      return this.some<Parsed>({ kind: "step", idx });
    }
    return this.none();
  }

  public async run(interaction: ButtonInteraction, parsed: Parsed) {
    if (!interaction.inGuild() || !interaction.guild) return;

    // "start" is a fresh ephemeral reply (the Verify button lives on a
    // shared public panel); "step" edits that per-user ephemeral challenge
    // message in place. Defer immediately, before any DB/Redis lookups, to
    // beat Discord's 3s ack window.
    if (parsed.kind === "start") {
      await interaction.deferReply({
        flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
      });
    } else {
      await interaction.deferUpdate();
    }

    const t = await fetchTyped(interaction);
    const security = getUtility("security");
    const { guild } = interaction;
    const userId = interaction.user.id;

    if (parsed.kind === "start") {
      const config = await security.loadVerificationConfig(guild.id);
      if (!config.enabled || !config.verifiedRoleId) {
        return interaction.editReply(
          ephemeralCard(
            makeErrorCard(
              t(PanelsKeys.VerifyDisabledTitle),
              t(PanelsKeys.VerifyDisabled),
            ),
          ),
        );
      }
      if (config.mode === "none") {
        await security.grantVerified(guild, userId);
        return interaction.editReply(
          ephemeralCard(
            makeSuccessCard(t(PanelsKeys.VerifyOkTitle), t(PanelsKeys.VerifyOk)),
          ),
        );
      }

      if (config.mode === "web") {
        const baseUrl = getDashboardPublicUrl();
        if (!baseUrl) {
          return interaction.editReply(
            ephemeralCard(
              makeErrorCard(
                t(PanelsKeys.VerifyWebUnavailableTitle),
                t(PanelsKeys.VerifyWebUnavailable),
              ),
            ),
          );
        }
        return interaction.editReply(
          ephemeralCard(buildWebPromptCard(t, `${baseUrl}/verify/${guild.id}`)),
        );
      }

      const state = await security.startChallenge(guild.id, userId, config);
      return interaction.editReply(ephemeralCard(buildChallengeCard(t, state)));
    }

    const result = await security.advanceChallenge(guild.id, userId, parsed.idx);
    if (!result) {
      return interaction.editReply(
        makeErrorCard(
          t(PanelsKeys.VerifyExpiredTitle),
          t(PanelsKeys.VerifyExpired),
        ),
      );
    }

    const { state, outcome } = result;
    switch (outcome) {
      case "solved":
        await security.grantVerified(guild, userId);
        return interaction.editReply(
          makeSuccessCard(t(PanelsKeys.VerifyOkTitle), t(PanelsKeys.VerifyOk)),
        );
      case "progress":
        return interaction.editReply(buildProgressCard(t, state));
      case "wrong":
        return interaction.editReply(buildWrongCard(t, state));
      case "failed":
        return interaction.editReply(
          makeErrorCard(
            t(PanelsKeys.VerifyFailedTitle),
            t(PanelsKeys.VerifyFailed),
          ),
        );
    }
  }
}
