import { collectPingData } from "../../services/ping-collect.js";
import type { Container } from "@lumi/lib/services.js";
import {
  buildOverviewCard,
  buildDetailCard,
  type PingCategory,
} from "../../ui/ping-cards.js";
import { MessageFlags } from "discord.js";
import {
  acknowledge,
  checkSecurity,
  defineInteraction,
} from "@lumi/lib/interactions/interaction-def.js";
import { PingId } from "../../constants.js";

export const ping = defineInteraction({
  prefix: PingId.prefix,
  async run(services: Container, interaction: import("discord.js").Interaction) {
    if (!interaction.isMessageComponent()) return;
    const parsed = PingId.parse(interaction.customId);
    if (!parsed) return;
    const { cat, userId } = parsed;

    let category = cat;
    if (category === "select" && interaction.isStringSelectMenu()) {
      category = interaction.values[0]!;
    }
    const result = {
      category: category as PingCategory | "overview",
      userId,
    };
    checkSecurity(interaction, result.userId);

    await acknowledge(interaction);

    const { pingViewStates } = await import("../../commands/ping.js");
    pingViewStates.set(result.userId, result.category);

    const data = await collectPingData(services);

    if (result.category === "overview") {
      return interaction
        .editReply({
          flags: MessageFlags.IsComponentsV2,
          components: [
            buildOverviewCard({ roundTrip: null, ...data }, result.userId),
          ],
        })
        .catch(() => null);
    }

    const card = buildDetailCard(
      result.category,
      { roundTrip: null, ...data },
      result.userId,
    );
    return interaction.editReply({ flags: MessageFlags.IsComponentsV2, components: [card] }).catch(() => null);
  },
});
