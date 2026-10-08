import { UserError } from "@lumi/shared";
import type { Container } from "#lib/services.js";
import type {
  ButtonInteraction,
  GuildMember,
  MessageComponentInteraction,
  VoiceBasedChannel,
} from "discord.js";
import { fetchTyped } from "#lib/i18n/index.js";
import type { LumiT } from "#lib/i18n/index.js";
import {
  acknowledge,
  defineInteraction,
} from "#lib/interactions/interaction-def.js";
import { getUtility } from "#lib/module-system/Utility.js";
import { Emojis } from "#lib/utilities/assets.js";
import { makeSuccessCard } from "#lib/ui/cards.js";
import { getVcRecord, removeVcRecord } from "#modules/tempvc/data/tempvc.js";
import { TempVcKeys, TempVcPanelId } from "../../constants.js";
import {
  showLimitModal,
  showRenameModal,
} from "@lumi/application/services/tempvc/panel-helpers.js";
import { resolveOwnedVc, resolveVc } from "@lumi/application/services/tempvc/panel-guard.js";
import type { TempVcUtility } from "#modules/tempvc/utilities/TempVcUtility.js";
import {
  buildBlockView,
  buildDeleteConfirmView,
  buildKickView,
  buildPanel,
  buildTransferView,
  buildTrustView,
  buildUnblockView,
  buildUntrustView,
} from "#modules/tempvc/ui/panel.js";

export const tempVcPanelButton = defineInteraction({
  prefix: TempVcPanelId.prefix,
  module: "tempvc",
  async run(services: Container, interaction: ButtonInteraction): Promise<void> {
    if (!interaction.isButton()) return;
    const parsed = TempVcPanelId.parse(interaction.customId);
    if (!parsed) return;
    const { action, channelId } = parsed;
    const service: TempVcUtility = getUtility("tempvc");
    const { guildId } = interaction;
    if (!guildId) return;

    // showModal() must be the interaction's first response, so "name"/"limit"
    // can't defer first; every other action defers immediately to beat
    // Discord's 3s ack window before the i18n/Valkey lookups below.
    const opensModal = action === "name" || action === "limit";
    if (!opensModal) await acknowledge(interaction);

    const t = await fetchTyped(interaction);
    const member = interaction.member as GuildMember;
    const notFound = {
      channel: {
        identifier: "TempVcGone",
        message: `${Emojis.Cross} ${t("tempvc:channelNoLongerExists")}`,
      },
      record: {
        identifier: "TempVcUnmanaged",
        message: `${Emojis.Cross} ${t("tempvc:channelNoLongerManaged")}`,
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
        message: `${Emojis.Cross} ${
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
        message: `${Emojis.Cross} ${t("tempvc:mustBeInChannelToClaim")}`,
      });
    }
    const owner = channel.members.get(record.ownerId);
    if (owner) {
      throw new UserError({
        identifier: "TempVcOwnerPresent",
        message: `${Emojis.Cross} ${t("tempvc:ownerStillHere")}`,
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
        message: `${Emojis.Loading} ${t("tempvc:someoneElseClaiming")}`,
      });
    }

    const fullRecord = (await getVcRecord(services, interaction.guildId!, channel.id))!;
    const next = await service.setOwner(services, channel, fullRecord, member.id);
    await interaction.editReply(await buildPanel(services, channel, next, t));
}
