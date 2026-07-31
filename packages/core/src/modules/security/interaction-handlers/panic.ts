import {
  InteractionHandler,
  InteractionHandlerTypes,
  container,
} from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import type { ButtonInteraction } from "discord.js";
import { BaseInteractionHandler } from "#lib/interaction-handler.js";
import { fetchTyped } from "#lib/commands.js";
import { getService } from "#lib/module-system/Service.js";
import { PanelsKeys } from "#lib/i18n/keys.js";
import { ephemeralCard, makeErrorCard } from "#lib/utilities/cards.js";
import { PANIC_REVERT_ID, buildPanicRevertedCard } from "../lib/panic-card.js";

function memberRoleIds(member: unknown): string[] {
  if (!member || typeof member !== "object") return [];
  const roles = (member as { roles?: unknown }).roles;
  if (Array.isArray(roles)) return roles as string[];
  const cache = (roles as { cache?: { keys?: () => Iterable<string> } })?.cache;
  if (cache && typeof cache.keys === "function") return Array.from(cache.keys());
  if (cache && typeof cache === "object") return Object.keys(cache);
  return [];
}

@ApplyOptions<InteractionHandler.Options>({
  name: "security-panic-revert",
  interactionHandlerType: InteractionHandlerTypes.Button,
})
export class PanicRevertInteractionHandler extends BaseInteractionHandler {
  public override parse(interaction: ButtonInteraction) {
    if (interaction.customId !== PANIC_REVERT_ID) return this.none();
    return this.some();
  }

  public async run(interaction: ButtonInteraction) {
    if (!interaction.inGuild() || !interaction.guild) return;
    const t = await fetchTyped(interaction);

    const hasPermit = await container.permitResolver.hasPermit({
      guildId: interaction.guild.id,
      userId: interaction.user.id,
      roleIds: memberRoleIds(interaction.member),
      permitNode: "admin.*",
      guildOwnerId: interaction.guild.ownerId,
    });
    if (!hasPermit) {
      return interaction.reply(
        ephemeralCard(
          makeErrorCard(t(PanelsKeys.PanicDeniedTitle), t(PanelsKeys.PanicDenied)),
        ),
      );
    }

    const result = await getService("security").revertPanic(interaction.guild);
    if (!result) {
      return interaction.update(
        makeErrorCard(t(PanelsKeys.PanicNotActiveTitle), t(PanelsKeys.PanicNotActive)),
      );
    }

    return interaction.update(buildPanicRevertedCard(t, result.restoredCount));
  }
}
