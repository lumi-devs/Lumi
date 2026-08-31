import {
  InteractionHandler,
  InteractionHandlerTypes,
  UserError,
} from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import type {
  ButtonInteraction,
  GuildMember,
  Interaction,
  MessageComponentInteraction,
  VoiceBasedChannel,
} from "discord.js";
import { fetchTyped } from "#lib/commands.js";
import type { LumiT } from "#lib/i18n/index.js";
import { BaseInteractionHandler } from "#lib/interaction-handler.js";
import { getUtility } from "#lib/module-system/Utility.js";
import { Emojis } from "#utilities/assets.js";
import { makeSuccessCard } from "#utilities/cards.js";
import { getVcRecord, removeVcRecord } from "#modules/tempvc/data.js";
import { TVC, TempVcKeys } from "#modules/tempvc/keys.js";
import {
  showLimitModal,
  showRenameModal,
} from "#modules/tempvc/lib/panel-helpers.js";
import { resolveOwnedVc, resolveVc } from "#modules/tempvc/panel-guard.js";
import type TempVcUtility from "#modules/tempvc/utilities/TempVcUtility.js";
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

@ApplyOptions<InteractionHandler.Options>({
  name: "tempvc-panel-button",
  interactionHandlerType: InteractionHandlerTypes.Button,
})
export class TempVcPanelButtonHandler extends BaseInteractionHandler {
  private get service(): TempVcUtility {
    return getUtility("tempvc");
  }

  public override parse(interaction: Interaction) {
    if (!interaction.isButton()) return this.none();
    if (!interaction.customId.startsWith(`${TVC}:`)) return this.none();
    const [, action, channelId] = interaction.customId.split(":");
    if (!action || !channelId) return this.none();
    return this.some({ action, channelId });
  }

  public async run(
    interaction: ButtonInteraction,
    { action, channelId }: { action: string; channelId: string },
  ): Promise<void> {
    if (!interaction.inGuild()) return;

    // showModal() must be the interaction's first response, so "name"/"limit"
    // can't defer first; every other action defers immediately to beat
    // Discord's 3s ack window before the i18n/Redis lookups below.
    const opensModal = action === "name" || action === "limit";
    if (!opensModal) await interaction.deferUpdate();

    const t = await fetchTyped(interaction);
    const member = interaction.member as GuildMember;
    const notFound = {
      channel: {
        identifier: "TempVcGone",
        message: `${Emojis.CROSS} ${t("tempvc:channelNoLongerExists")}`,
      },
      record: {
        identifier: "TempVcUnmanaged",
        message: `${Emojis.CROSS} ${t("tempvc:channelNoLongerManaged")}`,
      },
    };

    if (action === "claim") {
      const { channel, record } = (await resolveVc(
        interaction.guild,
        interaction.guildId,
        channelId,
        notFound,
      ))!;
      await this.#claim(interaction, channel, record);
      return;
    }

    const { channel, record } = (await resolveOwnedVc(
      interaction.guild,
      interaction.guildId,
      channelId,
      this.service,
      member,
      t,
      notFound,
    ))!;

    switch (action) {
      case "panel":
        await interaction.editReply(buildPanel(channel, record, t));
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
        await this.#doDelete(interaction, channel, t);
        return;
      case "lock": {
        const next = await this.service.setLock(
          channel,
          record,
          !record.locked,
        );
        await interaction.editReply(buildPanel(channel, next, t));
        return;
      }
      case "hide": {
        const next = await this.service.setHide(
          channel,
          record,
          !record.hidden,
        );
        await interaction.editReply(buildPanel(channel, next, t));
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
  }

  async #doDelete(
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
        message: `${Emojis.CROSS} Failed to delete the voice channel. Try again.`,
      });
    }
    if (guildId) await removeVcRecord(guildId, id);
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

  async #claim(
    interaction: MessageComponentInteraction,
    channel: VoiceBasedChannel,
    record: { ownerId: string },
  ): Promise<void> {
    const t = await fetchTyped(interaction);
    const member = interaction.member as GuildMember;
    if (member.voice.channelId !== channel.id) {
      throw new UserError({
        identifier: "TempVcClaimNotIn",
        message: `${Emojis.CROSS} ${t("tempvc:mustBeInChannelToClaim")}`,
      });
    }
    const owner = channel.members.get(record.ownerId);
    if (owner) {
      throw new UserError({
        identifier: "TempVcOwnerPresent",
        message: `${Emojis.CROSS} ${t("tempvc:ownerStillHere")}`,
      });
    }

    const guard = await this.service.redis.set(
      TempVcKeys.claimGuard(channel.id),
      member.id,
      "PX",
      3000,
      "NX",
    );
    if (guard === null) {
      throw new UserError({
        identifier: "TempVcClaimRace",
        message: `${Emojis.LOADING} ${t("tempvc:someoneElseClaiming")}`,
      });
    }

    const fullRecord = (await getVcRecord(interaction.guildId!, channel.id))!;
    const next = await this.service.setOwner(channel, fullRecord, member.id);
    await interaction.editReply(buildPanel(channel, next, t));
  }
}
