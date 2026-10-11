import type { ModalSubmitInteraction } from "discord.js";
import {
  acknowledge,
  defineInteraction,
} from "#src/lib/interactions/InteractionDef.js";
import type { Container } from "#src/lib/Services.js";
import { makeErrorCard } from "#src/lib/ui/Cards.js";
import {
  assertTempvcAdmin,
  renderGeneratorCard,
  updateGenerator,
} from "#src/modules/tempvc/commands/Tempvc.js";

function parseId(customId: string): { kind: string; channelId: string } | null {
  const parts = customId.split(":");
  if (parts[0] !== "tempvc" || parts[1] !== "admin") return null;
  if (parts[2] !== "name" && parts[2] !== "limit") return null;
  const channelId = parts[3];
  if (!channelId) return null;
  return { kind: parts[2], channelId };
}

export const tempvcAdminModal = defineInteraction({
  prefix: ["tempvc:admin:name", "tempvc:admin:limit"],
  module: "tempvc",
  kinds: ["modal"],
  async run(
    services: Container,
    interaction: ModalSubmitInteraction,
  ): Promise<void> {
    const guild = interaction.guild;
    const guildId = interaction.guildId;
    if (!guild || !guildId) return;
    const parsed = parseId(interaction.customId);
    if (!parsed) return;
    if (!(await assertTempvcAdmin(interaction))) return;
    await acknowledge(interaction);

    if (parsed.kind === "name") {
      const name = interaction.fields.getTextInputValue("name").trim();
      if (!name) {
        await interaction
          .editReply({
            ...makeErrorCard("Invalid Name", "Give the template some text."),
          })
          .catch(() => null);
        return;
      }
      await updateGenerator(services, guildId, parsed.channelId, {
        name: name.slice(0, 100),
      });
    } else {
      const raw = interaction.fields.getTextInputValue("limit").trim();
      const limit = Number.parseInt(raw, 10);
      if (Number.isNaN(limit) || limit < 0 || limit > 99) {
        await interaction
          .editReply({
            ...makeErrorCard("Invalid Limit", "Enter 0-99 (0 = unlimited)."),
          })
          .catch(() => null);
        return;
      }
      await updateGenerator(services, guildId, parsed.channelId, { limit });
    }
    await interaction
      .editReply({
        ...(await renderGeneratorCard(services, guild, parsed.channelId)),
      })
      .catch(() => null);
  },
});
