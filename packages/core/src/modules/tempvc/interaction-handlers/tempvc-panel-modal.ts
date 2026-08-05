import {
  InteractionHandler,
  InteractionHandlerTypes,
} from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import type { GuildMember, ModalSubmitInteraction } from "discord.js";
import { fetchTyped } from "#lib/commands.js";
import { BaseInteractionHandler } from "#lib/interaction-handler.js";
import { getService } from "#lib/module-system/Service.js";
import {
  ephemeralCard,
  makeErrorCard,
  makeSuccessCard,
} from "#utilities/cards.js";
import { getVcRecord, patchVcRecord } from "#modules/tempvc/data.js";
import { TVC } from "#modules/tempvc/keys.js";
import { assertOwner } from "#modules/tempvc/lib/panel-helpers.js";
import type TempVcService from "#modules/tempvc/services/TempVcService.js";
import { buildBackRows, buildPanel } from "#modules/tempvc/ui/panel.js";

const MODAL_KINDS = new Set(["namem", "limitm"]);

@ApplyOptions<InteractionHandler.Options>({
  name: "tempvc-panel-modal",
  interactionHandlerType: InteractionHandlerTypes.ModalSubmit,
})
export class TempVcPanelModalHandler extends BaseInteractionHandler {
  private get service(): TempVcService {
    return getService("tempvc");
  }

  public override parse(interaction: ModalSubmitInteraction) {
    if (!interaction.customId.startsWith(`${TVC}:`)) return this.none();
    const [, kind, channelId] = interaction.customId.split(":");
    if (!kind || !channelId || !MODAL_KINDS.has(kind)) return this.none();
    return this.some({ kind, channelId });
  }

  public async run(
    interaction: ModalSubmitInteraction,
    { kind, channelId }: { kind: string; channelId: string },
  ): Promise<void> {
    if (!interaction.inGuild()) return;
    await interaction.deferUpdate();

    const channel = interaction.guild?.channels.cache.get(channelId);
    if (!channel || !channel.isVoiceBased()) return;

    const record = await getVcRecord(interaction.guildId, channelId);
    if (!record) return;
    const member = interaction.member as GuildMember;
    const t = await fetchTyped(interaction);
    assertOwner(this.service, member, channel, record.ownerId, t);

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
      await patchVcRecord(interaction.guildId, channelId, {
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

    const fresh = await getVcRecord(interaction.guildId, channelId);
    if (fresh) {
      await interaction.editReply(buildPanel(channel, fresh, t));
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
