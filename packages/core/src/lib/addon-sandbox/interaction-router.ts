import type { Interaction } from "discord.js";
import type { AddonHost } from "./AddonHost.js";
import {
  addInteractionDef,
  defineInteraction,
} from "#lib/interactions/interaction-def.js";

export function registerAddonInteractionRouting(host: AddonHost): void {
  addInteractionDef(
    defineInteraction({
      match: (customId: string) => host.ownerOfCustomId(customId) !== null,
      async run(_services, interaction: Interaction) {
        if (!interaction.isMessageComponent() && !interaction.isModalSubmit()) {
          return;
        }
        const owner = host.ownerOfCustomId(interaction.customId);
        if (!owner) return;
        await host.invokeInteraction(owner, interaction);
      },
    }),
  );
}
