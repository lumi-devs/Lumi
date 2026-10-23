import { GuildMember, type ButtonInteraction } from "discord.js";
import { hasPermit } from "@lumi/module-kit";
import type { LumiServices } from "@lumi/module-kit";
import { ephemeralCard, makeErrorCard, makeWarningCard } from "@lumi/ui";
import { getSecurityConfig } from "./services/config.ts";
import { revertPanic } from "./services/panic.ts";
import {
  advanceChallenge,
  grantVerified,
  startChallenge,
} from "./services/verification.ts";
import {
  PanicRevertId,
  VerifyButtonId,
  buildChallengeCard,
  buildPanicRevertedCard,
  buildProgressCard,
  buildVerifiedCard,
  buildWrongCard,
} from "./ui.ts";

async function handleVerify(
  services: LumiServices,
  interaction: ButtonInteraction,
): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;
  if (!(await services.modules.isEnabled(guild.id, "security"))) {
    await interaction.reply(
      ephemeralCard(
        makeErrorCard("Verification Unavailable", "The Security module is disabled in this server."),
      ),
    );
    return;
  }
  const config = await getSecurityConfig(services, guild.id).catch(() => null);
  if (!config?.verification_enabled || !config.verified_role_id) {
    await interaction.reply(
      ephemeralCard(
        makeErrorCard("Verification Unavailable", "Verification is not configured in this server."),
      ),
    );
    return;
  }

  if (config.verification_mode === "none") {
    const granted = await grantVerified(services, guild, interaction.user.id);
    await interaction.reply(
      ephemeralCard(
        granted
          ? buildVerifiedCard()
          : makeErrorCard("Verification Failed", "I could not assign the verified role. Contact staff."),
      ),
    );
    return;
  }

  const state = await startChallenge(services, guild.id, interaction.user.id, config);
  await interaction.reply(
    ephemeralCard(buildChallengeCard(state, interaction.user.id)),
  );
}

async function handleCaptcha(
  services: LumiServices,
  interaction: ButtonInteraction,
  parts: readonly string[],
): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;
  if (!(await services.modules.isEnabled(guild.id, "security"))) {
    await interaction.update(
      makeErrorCard("Verification Unavailable", "The Security module is disabled in this server."),
    );
    return;
  }

  const ownerId = parts[2];
  const clicked = Number(parts[3]);
  if (!ownerId || !Number.isInteger(clicked)) return;
  if (interaction.user.id !== ownerId) {
    await interaction.reply(
      ephemeralCard(
        makeWarningCard(
          "Not Your Challenge",
          "Press **Verify** in the verification panel to start your own challenge.",
        ),
      ),
    );
    return;
  }

  const result = await advanceChallenge(services, guild.id, interaction.user.id, clicked);
  if (!result) {
    await interaction.update(
      makeErrorCard("Challenge Expired", "That verification challenge is no longer valid."),
    );
    return;
  }

  if (result.outcome === "solved") {
    const granted = await grantVerified(services, guild, interaction.user.id);
    await interaction.update(
      granted
        ? buildVerifiedCard()
        : makeErrorCard("Verification Failed", "I could not assign the verified role. Contact staff."),
    );
    return;
  }

  if (result.outcome === "progress") {
    await interaction.update(buildProgressCard(result.state, interaction.user.id));
    return;
  }

  if (result.outcome === "wrong") {
    await interaction.update(buildWrongCard(result.state, interaction.user.id));
    return;
  }

  await interaction.update(
    makeWarningCard(
      "Verification Failed",
      "You used all attempts. Press **Verify** in the verification panel to try again.",
    ),
  );
}

async function handlePanicRevert(
  services: LumiServices,
  interaction: ButtonInteraction,
): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;

  const member = interaction.member instanceof GuildMember ? interaction.member : null;
  const allowed = await hasPermit(services, {
    guildId: guild.id,
    userId: interaction.user.id,
    channelId: interaction.channelId,
    member,
    guildOwnerId: guild.ownerId,
    node: "admin.*",
  });
  if (!allowed) {
    await interaction.reply(
      ephemeralCard(makeErrorCard("Not Allowed", "You need the `admin.*` permit to revert panic mode.")),
    );
    return;
  }

  await interaction.deferUpdate();
  let result: Awaited<ReturnType<typeof revertPanic>>;
  try {
    result = await revertPanic(services, guild);
  } catch (error) {
    services.logger.error({ error, guildId: guild.id }, "failed to revert panic");
    await interaction.editReply({
      components: [
        ...makeErrorCard(
          "Revert Failed",
          error instanceof Error ? error.message : "Panic mode could not be reverted.",
        ).components,
      ],
    });
    return;
  }
  if (!result) {
    await interaction.editReply({
      components: [
        ...makeErrorCard("Not Active", "Panic mode is not active in this server.").components,
      ],
    });
    return;
  }

  await interaction.editReply({
    components: [...buildPanicRevertedCard(result.restoredCount, result.invitesResumed).components],
  });
}

export async function handleSecurityInteraction(
  services: LumiServices,
  interaction: ButtonInteraction,
): Promise<void> {
  const customId = interaction.customId;
  if (customId === VerifyButtonId) {
    await handleVerify(services, interaction);
    return;
  }
  if (customId.startsWith("sec:captcha:")) {
    await handleCaptcha(services, interaction, customId.split(":"));
    return;
  }
  if (customId === PanicRevertId) {
    await handlePanicRevert(services, interaction);
  }
}
