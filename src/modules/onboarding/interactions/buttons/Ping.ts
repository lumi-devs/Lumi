import { collectPingData } from "#src/modules/onboarding/services/PingCollect.js";
import type { Container } from "#src/lib/Services.js";
import {
  buildOverviewCard,
  buildDetailCard,
  type PingCategory,
} from "#src/modules/onboarding/ui/PingCards.js";
import { MessageFlags, type Interaction } from "discord.js";
import {
  acknowledge,
  checkSecurity,
  defineInteraction,
} from "#src/lib/interactions/InteractionDef.js";
import { PingId } from "#src/modules/core/Constants.js";

export const ping = defineInteraction({
  prefix: PingId.prefix,
  async run(services: Container, interaction: Interaction) {
    if (!interaction.isMessageComponent()) return;
    const parsed = PingId.parse(interaction.customId);
    if (!parsed) return;
    const { cat, userId } = parsed;

    let category = cat as PingCategory | "overview";
    if (cat === "select" && interaction.isStringSelectMenu()) {
      category = interaction.values[0]! as PingCategory | "overview";
    }
    checkSecurity(interaction, userId);

    await acknowledge(interaction);

    const { pingViewStates } = await import("#src/modules/onboarding/commands/Ping.js");
    pingViewStates.set(userId, category);

    const data = await collectPingData(services);

    if (category === "overview") {
      return interaction
        .editReply({
          flags: MessageFlags.IsComponentsV2,
          components: [
            buildOverviewCard({ roundTrip: null, ...data }, userId),
          ],
        })
        .catch(() => null);
    }

    const card = buildDetailCard(
      category,
      { roundTrip: null, ...data },
      userId,
    );
    return interaction.editReply({ flags: MessageFlags.IsComponentsV2, components: [card] }).catch(() => null);
  },
});
