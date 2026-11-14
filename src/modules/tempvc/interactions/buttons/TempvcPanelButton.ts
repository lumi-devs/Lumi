import { UserError } from "@shared/Index.ts";
import type { Container } from "@lib/Services.js";
import type {
  ButtonInteraction,
  GuildMember,
  MessageComponentInteraction,
  VoiceBasedChannel,
} from "discord.js";
import { fetchTyped } from "@i18n/Index.js";
import type { LumiT } from "@i18n/Index.js";
import {
  acknowledge,
  defineInteraction,
} from "@interactions/InteractionDef.js";
import { getUtility } from "@module-system/Utility.js";
import { makeSuccessCard } from "@ui/Cards.js";
import { getVcRecord, removeVcRecord } from "@modules/tempvc/data/Tempvc.js";
import { TempVcKeys, TempVcPanelId } from "@modules/tempvc/Constants.js";
import {
  handlePanelMenuAction,
} from "@modules/tempvc/services/PanelHelpers.js";
import { resolveOwnedVc, resolveVc } from "@modules/tempvc/services/PanelGuard.js";
import type { TempVcUtility } from "@modules/tempvc/utilities/TempVcUtility.js";
import { buildPanel } from "@modules/tempvc/ui/Panel.js";

export const tempVcPanelButton = defineInteraction({
  prefix: TempVcPanelId.prefix,
  module: "tempvc",
  kinds: ["button"],
  async run(services: Container, interaction: ButtonInteraction): Promise<void> {
    if (!interaction.isButton()) return;
    const parsed = TempVcPanelId.parse(interaction.customId);
    if (!parsed) return;
    const { action, channelId } = parsed;
    const service: TempVcUtility = getUtility("tempvc");
    const { guildId } = interaction;
    if (!guildId) return;

    const opensModal = action === "name" || action === "limit";
    if (!opensModal) await acknowledge(interaction);

    const t = await fetchTyped(interaction);
    const member = interaction.member as GuildMember;
    const notFound = {
      channel: {
        identifier: "TempVcGone",
        message: `❌ ${t("tempvc:channelNoLongerExists")}`,
      },
      record: {
        identifier: "TempVcUnmanaged",
        message: `❌ ${t("tempvc:channelNoLongerManaged")}`,
      },
    };

    if (action === "claim") {
      const resolved = await resolveVc(
        interaction.guild,
        guildId,
        channelId,
        notFound,
        services,
      );
      if (!resolved) return;
      const { channel, record } = resolved;
      await claim(services, service, interaction, channel, record);
      return;
    }

    const owned = await resolveOwnedVc(
      interaction.guild,
      guildId,
      channelId,
      service,
      member,
      t,
      notFound,
      services,
    );
    if (!owned) return;
    const { channel, record } = owned;

    if (action === "panel") {
      await interaction.editReply(await buildPanel(services, channel, record, t));
      return;
    }
    if (action === "delyes") {
      await doDelete(services, interaction, channel, t);
      return;
    }
    await handlePanelMenuAction(
      services,
      service,
      interaction,
      channel,
      record,
      action,
      t,
    );
  },
});

async function doDelete(
  services: Container,
  interaction: MessageComponentInteraction,
  channel: VoiceBasedChannel,
  t?: LumiT,
): Promise<void> {
    const { id, guildId } = channel;
    const deleted = await channel
      .delete("Deleted by owner via panel")
      .then(() => true)
      .catch(() => false);
    if (!deleted) {
      throw new UserError({
        identifier: "TempVcDeleteFailed",
        message: `❌ ${
          t ? t("tempvc:deleteFailedMessage") : "Failed to delete the voice channel. Try again."
        }`,
      });
    }
    if (guildId) await removeVcRecord(services, guildId, id);
    await interaction
      .editReply({
        ...makeSuccessCard(
          t ? t("tempvc:deletedTitle") : "✅ Deleted",
          t ? t("tempvc:deletedMessage") : "Voice channel deleted.",
        ),
        components: [],
      })
      .catch(() => null);
  }

async function claim(
  services: Container,
  service: TempVcUtility,
  interaction: MessageComponentInteraction,
  channel: VoiceBasedChannel,
  record: { ownerId: string },
): Promise<void> {
    const t = await fetchTyped(interaction);
    const member = interaction.member as GuildMember;
    if (member.voice.channelId !== channel.id) {
      throw new UserError({
        identifier: "TempVcClaimNotIn",
        message: `❌ ${t("tempvc:mustBeInChannelToClaim")}`,
      });
    }
    const owner = channel.members.get(record.ownerId);
    if (owner) {
      throw new UserError({
        identifier: "TempVcOwnerPresent",
        message: `❌ ${t("tempvc:ownerStillHere")}`,
      });
    }

    const guard = await services.redis.set(
      TempVcKeys.claimGuard(channel.id),
      member.id,
      "PX",
      3000,
      "NX",
    );
    if (guard === null) {
      throw new UserError({
        identifier: "TempVcClaimRace",
        message: `⏳ ${t("tempvc:someoneElseClaiming")}`,
      });
    }

    const fullRecord = await getVcRecord(services, interaction.guildId!, channel.id);
    if (!fullRecord) return;
    const next = await service.setOwner(services, channel, fullRecord, member.id);
    await interaction.editReply(await buildPanel(services, channel, next, t));
}
