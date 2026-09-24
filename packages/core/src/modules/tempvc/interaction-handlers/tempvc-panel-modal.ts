import {
  InteractionHandlerTypes,
} from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import type { GuildMember, ModalSubmitInteraction } from "discord.js";
import { fetchTyped } from "#lib/commands.js";
import { ModuleInteractionHandler } from "#lib/interactions/ModuleInteractionHandler.js";
import { getUtility } from "#lib/module-system/Utility.js";
import { ephemeralCard, makeErrorCard, makeSuccessCard } from "#lib/ui/cards.js";
import { getVcRecord, patchVcRecord } from "#modules/tempvc/data/tempvc.js";
import { TempVcPanelId } from "../constants.js";
import { resolveOwnedVc } from "#modules/tempvc/services/panel-guard.js";
import type TempVcUtility from "#modules/tempvc/utilities/TempVcUtility.js";
import { buildBackRows, buildPanel } from "#modules/tempvc/ui/panel.js";

const ModalKinds = new Set(["namem", "limitm"]);

@ApplyOptions<ModuleInteractionHandler.Options>({
  name: "tempvc-panel-modal",
  interactionHandlerType: InteractionHandlerTypes.ModalSubmit,
  module: "tempvc",
})
export class TempVcPanelModalHandler extends ModuleInteractionHandler<
  ModalSubmitInteraction,
  { action: string; channelId: string }
> {
  private get service(): TempVcUtility {
    return getUtility("tempvc");
  }

  public override parse(interaction: ModalSubmitInteraction) {
    const parsed = TempVcPanelId.parse(interaction.customId);
    if (!parsed || !ModalKinds.has(parsed.action)) return this.none();
    return this.some(parsed);
  }

  protected override async handle(
    interaction: ModalSubmitInteraction,
    { action: kind, channelId }: { action: string; channelId: string },
  ): Promise<void> {
    const { guildId } = interaction;
    if (!guildId) return;
    await this.acknowledge(interaction);

    const member = interaction.member as GuildMember;
    const t = await fetchTyped(interaction);
    const resolved = await resolveOwnedVc(
      interaction.guild,
      guildId,
      channelId,
      this.service,
      member,
      t,
    );
    if (!resolved) return;
    const { channel } = resolved;

    if (kind === "namem") {
      const name = interaction.fields.getTextInputValue("name").trim();
      if (!name) {
        await interaction.followUp(
          ephemeralCard(
            makeErrorCard(
              t("tempvc:invalidNameTitle"),
              t("tempvc:modalProvideNonEmptyName"),
              { actionRows: buildBackRows(channelId) },
            ),
          ),
        );
        return;
      }
      await channel.setName(name.slice(0, 100), "Renamed by owner");
      await patchVcRecord(guildId, channelId, {
        name: channel.name,
      });
    } else {
      const raw = interaction.fields.getTextInputValue("limit").trim();
      const limit = Number.parseInt(raw, 10);
      if (Number.isNaN(limit) || limit < 0 || limit > 99) {
        await interaction.followUp(
          ephemeralCard(
            makeErrorCard(
              t("tempvc:modalLimitTitle"),
              t("tempvc:modalEnterValidLimit"),
              { actionRows: buildBackRows(channelId) },
            ),
          ),
        );
        return;
      }
      await channel.setUserLimit(limit, "Limit changed by owner");
    }

    const fresh = await getVcRecord(guildId, channelId);
    if (fresh) {
      await interaction.editReply(await buildPanel(channel, fresh, t));
      return;
    }
    await interaction.followUp(
      ephemeralCard(
        makeSuccessCard(t("tempvc:updatedTitle"), t("tempvc:updatedMessage"), {
          actionRows: buildBackRows(channelId),
        }),
      ),
    );
  }
}
