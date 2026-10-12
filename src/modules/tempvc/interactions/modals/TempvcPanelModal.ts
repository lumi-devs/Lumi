import type { GuildMember, ModalSubmitInteraction } from "discord.js";
import type { Container } from "#src/lib/Services.js";
import { fetchTyped } from "#src/lib/i18n/Index.js";
import {
  acknowledge,
  defineInteraction,
} from "#src/lib/interactions/InteractionDef.js";
import { getUtility } from "#src/lib/module-system/Utility.js";
import { ephemeralCard, makeErrorCard, makeSuccessCard } from "#src/lib/ui/Cards.js";
import { getVcRecord, patchVcRecord } from "#src/modules/tempvc/data/Tempvc.js";
import { TempVcPanelId } from "#src/modules/tempvc/Constants.js";
import { resolveOwnedVc } from "#src/modules/tempvc/services/PanelGuard.js";
import type { TempVcUtility } from "#src/modules/tempvc/utilities/TempVcUtility.js";
import { buildBackRows, buildPanel } from "#src/modules/tempvc/ui/Panel.js";

const ModalKinds = new Set(["namem", "limitm"]);

export const tempVcPanelModal = defineInteraction({
  prefix: TempVcPanelId.prefix,
  module: "tempvc",
  kinds: ["modal"],
  async run(services: Container, interaction: ModalSubmitInteraction): Promise<void> {
    const parsed = TempVcPanelId.parse(interaction.customId);
    if (!parsed || !ModalKinds.has(parsed.action)) return;
    const { action: kind, channelId } = parsed;
    const service: TempVcUtility = getUtility("tempvc");
    const { guildId } = interaction;
    if (!guildId) return;
    await acknowledge(interaction);

    const member = interaction.member as GuildMember;
    const t = await fetchTyped(interaction);
    const resolved = await resolveOwnedVc(
      interaction.guild,
      guildId,
      channelId,
      service,
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
      await patchVcRecord(services, guildId, channelId, {
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

    const fresh = await getVcRecord(services, guildId, channelId);
    if (fresh) {
      await interaction.editReply(await buildPanel(services, channel, fresh, t));
      return;
    }
    await interaction.followUp(
      ephemeralCard(
        makeSuccessCard(t("tempvc:updatedTitle"), t("tempvc:updatedMessage"), {
          actionRows: buildBackRows(channelId),
        }),
      ),
    );
  },
});
