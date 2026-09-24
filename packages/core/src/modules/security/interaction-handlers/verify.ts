import {
  InteractionHandlerTypes,
} from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import { MessageFlags, type ButtonInteraction } from "discord.js";
import { ModuleInteractionHandler } from "#lib/interactions/ModuleInteractionHandler.js";
import { fetchTyped } from "#lib/commands.js";
import {
  loadVerificationConfig,
  grantVerified,
  startChallenge,
  advanceChallenge,
} from "../services/verification.js";
import { getDashboardPublicUrl } from "#lib/env.js";
import { ephemeralCard, makeErrorCard, makeSuccessCard } from "#lib/ui/cards.js";
import { CaptchaButtonId } from "../constants.js";
import {
  VerifyButtonId,
  buildChallengeCard,
  buildProgressCard,
  buildWebPromptCard,
  buildWrongCard,
} from "../ui/verify-panel.js";

type Parsed = { kind: "start" } | { kind: "step"; idx: number };

@ApplyOptions<ModuleInteractionHandler.Options>({
  name: "security-verify",
  interactionHandlerType: InteractionHandlerTypes.Button,
  module: "security",
})
export class VerifyInteractionHandler extends ModuleInteractionHandler<
  ButtonInteraction,
  Parsed
> {
  public override parse(interaction: ButtonInteraction) {
    if (interaction.customId === VerifyButtonId) {
      return this.some<Parsed>({ kind: "start" });
    }
    const parsed = CaptchaButtonId.parse(interaction.customId);
    if (parsed) {
      const idx = Number.parseInt(parsed.idx, 10);
      if (Number.isNaN(idx)) return this.none();
      return this.some<Parsed>({ kind: "step", idx });
    }
    return this.none();
  }

  protected override async handle(interaction: ButtonInteraction, parsed: Parsed) {
    const { guild } = interaction;
    if (!guild) return;

    // "start" is a fresh ephemeral reply (the Verify button lives on a
    // shared public panel); "step" edits that per-user ephemeral challenge
    // message in place. Defer immediately, before any DB/Redis lookups, to
    // beat Discord's 3s ack window.
    if (parsed.kind === "start") {
      await interaction.deferReply({
        flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
      });
    } else {
      await this.acknowledge(interaction);
    }

    const t = await fetchTyped(interaction);
    const userId = interaction.user.id;

    if (parsed.kind === "start") {
      const config = await loadVerificationConfig(guild.id);
      if (!config.enabled || !config.verifiedRoleId) {
        await interaction.editReply(
          ephemeralCard(
            makeErrorCard(
              t("panels:verifyDisabledTitle"),
              t("panels:verifyDisabled"),
            ),
          ),
        );
        return;
      }
      if (config.mode === "none") {
        await grantVerified(guild, userId);
        await interaction.editReply(
          ephemeralCard(
            makeSuccessCard(t("panels:verifyOkTitle"), t("panels:verifyOk")),
          ),
        );
        return;
      }

      if (config.mode === "web") {
        const baseUrl = getDashboardPublicUrl();
        if (!baseUrl) {
          await interaction.editReply(
            ephemeralCard(
              makeErrorCard(
                t("panels:verifyWebUnavailableTitle"),
                t("panels:verifyWebUnavailable"),
              ),
            ),
          );
          return;
        }
        await interaction.editReply(
          ephemeralCard(buildWebPromptCard(t, `${baseUrl}/verify/${guild.id}`)),
        );
        return;
      }

      const state = await startChallenge(guild.id, userId, config);
      await interaction.editReply(ephemeralCard(buildChallengeCard(t, state)));
      return;
    }

    const result = await advanceChallenge(guild.id, userId, parsed.idx);
    if (!result) {
      await interaction.editReply(
        makeErrorCard(
          t("panels:verifyExpiredTitle"),
          t("panels:verifyExpired"),
        ),
      );
      return;
    }

    const { state, outcome } = result;
    switch (outcome) {
      case "solved":
        await grantVerified(guild, userId);
        await interaction.editReply(
          makeSuccessCard(t("panels:verifyOkTitle"), t("panels:verifyOk")),
        );
        return;
      case "progress":
        await interaction.editReply(buildProgressCard(t, state));
        return;
      case "wrong":
        await interaction.editReply(buildWrongCard(t, state));
        return;
      case "failed":
        await interaction.editReply(
          makeErrorCard(
            t("panels:verifyFailedTitle"),
            t("panels:verifyFailed"),
          ),
        );
        return;
    }
  }
}
