import {
  InteractionHandlerTypes,
} from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import { MessageFlags, type ButtonInteraction } from "discord.js";
import { ModuleInteractionHandler } from "#lib/interactions/ModuleInteractionHandler.js";
import { fetchTyped } from "#lib/commands.js";
import { getUtility } from "#lib/module-system/Utility.js";
import { PanelsKeys } from "#lib/i18n/keys.js";
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
    const security = getUtility("security");
    const userId = interaction.user.id;

    if (parsed.kind === "start") {
      const config = await security.loadVerificationConfig(guild.id);
      if (!config.enabled || !config.verifiedRoleId) {
        await interaction.editReply(
          ephemeralCard(
            makeErrorCard(
              t(PanelsKeys.VerifyDisabledTitle),
              t(PanelsKeys.VerifyDisabled),
            ),
          ),
        );
        return;
      }
      if (config.mode === "none") {
        await security.grantVerified(guild, userId);
        await interaction.editReply(
          ephemeralCard(
            makeSuccessCard(t(PanelsKeys.VerifyOkTitle), t(PanelsKeys.VerifyOk)),
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
                t(PanelsKeys.VerifyWebUnavailableTitle),
                t(PanelsKeys.VerifyWebUnavailable),
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

      const state = await security.startChallenge(guild.id, userId, config);
      await interaction.editReply(ephemeralCard(buildChallengeCard(t, state)));
      return;
    }

    const result = await security.advanceChallenge(guild.id, userId, parsed.idx);
    if (!result) {
      await interaction.editReply(
        makeErrorCard(
          t(PanelsKeys.VerifyExpiredTitle),
          t(PanelsKeys.VerifyExpired),
        ),
      );
      return;
    }

    const { state, outcome } = result;
    switch (outcome) {
      case "solved":
        await security.grantVerified(guild, userId);
        await interaction.editReply(
          makeSuccessCard(t(PanelsKeys.VerifyOkTitle), t(PanelsKeys.VerifyOk)),
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
            t(PanelsKeys.VerifyFailedTitle),
            t(PanelsKeys.VerifyFailed),
          ),
        );
        return;
    }
  }
}
