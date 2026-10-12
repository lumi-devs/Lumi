import { UserError } from "#src/shared/Index.ts";
import type { Container } from "#src/lib/Services.js";
import type {
  ButtonInteraction,
  GuildMember,
  MessageComponentInteraction,
  VoiceBasedChannel,
} from "discord.js";
import { fetchTyped } from "#src/lib/i18n/Index.js";
import type { LumiT } from "#src/lib/i18n/Index.js";
import {
  acknowledge,
  defineInteraction,
} from "#src/lib/interactions/InteractionDef.js";
import { getUtility } from "#src/lib/module-system/Utility.js";
import { makeSuccessCard } from "#src/lib/ui/Cards.js";
import { getVcRecord, removeVcRecord } from "#src/modules/tempvc/data/Tempvc.js";
import { TempVcKeys, TempVcPanelId } from "#src/modules/tempvc/Constants.js";
import {
  showLimitModal,
  showRenameModal,
} from "#src/modules/tempvc/services/PanelHelpers.js";
import { resolveOwnedVc, resolveVc } from "#src/modules/tempvc/services/PanelGuard.js";
import type { TempVcUtility } from "#src/modules/tempvc/utilities/TempVcUtility.js";
import {
  buildBlockView,
  buildDeleteConfirmView,
  buildKickView,
  buildPanel,
  buildTransferView,
  buildTrustView,
  buildUnblockView,
  buildUntrustView,
} from "#src/modules/tempvc/ui/Panel.js";

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
      const { channel, record } = (await resolveVc(
        interaction.guild,
        guildId,
        channelId,
        notFound,
      ))!;
      await claim(services, service, interaction, channel, record);
      return;
    }

    const { channel, record } = (await resolveOwnedVc(
      interaction.guild,
      guildId,
      channelId,
      service,
      member,
      t,
      notFound,
    ))!;

    switch (action) {
      case "panel":
        await interaction.editReply(await buildPanel(services, channel, record, t));
        return;
      case "name":
        await showRenameModal(interaction, channel, t);
        return;
      case "limit":
        await showLimitModal(interaction, channel, t);
        return;
      case "delete":
        await interaction.editReply(buildDeleteConfirmView(channel, t));
        return;
      case "delyes":
        await doDelete(services, interaction, channel, t);
        return;
      case "lock": {
        const next = await service.setLock(
          services,
          channel,
          record,
          !record.locked,
        );
        await interaction.editReply(await buildPanel(services, channel, next, t));
        return;
      }
      case "hide": {
        const next = await service.setHide(
          services,
          channel,
          record,
          !record.hidden,
        );
        await interaction.editReply(await buildPanel(services, channel, next, t));
        return;
      }
      case "kick":
        await interaction.editReply(buildKickView(channel, record, t));
        return;
      case "trust":
        await interaction.editReply(buildTrustView(channel, record, t));
        return;
      case "untrust":
        await interaction.editReply(buildUntrustView(channel, record, t));
        return;
      case "block":
        await interaction.editReply(buildBlockView(channel, record, t));
        return;
      case "unblock":
        await interaction.editReply(buildUnblockView(channel, record, t));
        return;
      case "transfer":
        await interaction.editReply(buildTransferView(channel, record, t));
        return;
      default:
        return;
    }
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

    const guard = await services.valkey.set(
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

    const fullRecord = (await getVcRecord(services, interaction.guildId!, channel.id))!;
    const next = await service.setOwner(services, channel, fullRecord, member.id);
    await interaction.editReply(await buildPanel(services, channel, next, t));
}
