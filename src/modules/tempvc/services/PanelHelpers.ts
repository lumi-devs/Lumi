import { UserError } from "@shared/Index.ts";
import type { Container } from "@lib/Services.js";
import {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
} from "@discordjs/builders";
import {
  TextInputStyle,
  type GuildMember,
  type MessageComponentInteraction,
  type VoiceBasedChannel,
} from "discord.js";
import type { LumiT } from "@i18n/Index.js";
import { TempVcPanelId } from "@modules/tempvc/Constants.js";
import type { VcRecord } from "@modules/tempvc/data/Tempvc.js";
import type { TempVcUtility } from "@modules/tempvc/utilities/TempVcUtility.js";
import {
  buildBlockView,
  buildDeleteConfirmView,
  buildKickView,
  buildPanel,
  buildTransferView,
  buildTrustView,
  buildUnblockView,
  buildUntrustView,
} from "@modules/tempvc/ui/Panel.js";

export async function handlePanelMenuAction(
  services: Container,
  service: TempVcUtility,
  interaction: MessageComponentInteraction,
  channel: VoiceBasedChannel,
  record: VcRecord,
  action: string,
  t: LumiT,
): Promise<void> {
  switch (action) {
    case "name":
      await showRenameModal(interaction, channel, t);
      return;
    case "limit":
      await showLimitModal(interaction, channel, t);
      return;
    case "lock": {
      const next = await service.setLock(services, channel, record, !record.locked);
      await interaction.editReply(await buildPanel(services, channel, next, t));
      return;
    }
    case "hide": {
      const next = await service.setHide(services, channel, record, !record.hidden);
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
    case "delete":
      await interaction.editReply(buildDeleteConfirmView(channel, t));
      return;
    default:
      return;
  }
}

export function assertOwner(
  service: TempVcUtility,
  member: GuildMember,
  channel: VoiceBasedChannel,
  ownerId: string,
  t?: LumiT,
) {
  if (member.id === ownerId) return;
  if (service.canManage(member, channel)) return;
  throw new UserError({
    identifier: "TempVcNotOwner",
    message: `❌ ${t ? t("tempvc:onlyOwner") : "Only the channel owner can use these controls."}`,
  });
}

export async function showRenameModal(
  interaction: MessageComponentInteraction,
  channel: VoiceBasedChannel,
  t?: LumiT,
): Promise<void> {
  const modal = new ModalBuilder()
    .setCustomId(TempVcPanelId.build({ action: "namem", channelId: channel.id }))
    .setTitle(t ? t("tempvc:modalRenameTitle") : "Rename Voice Channel")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("name")
          .setLabel(t ? t("tempvc:modalRenameLabel") : "New name")
          .setStyle(TextInputStyle.Short)
          .setMaxLength(100)
          .setValue(channel.name)
          .setRequired(true),
      ),
    );
  await interaction.showModal(modal);
}

export async function showLimitModal(
  interaction: MessageComponentInteraction,
  channel: VoiceBasedChannel,
  t?: LumiT,
): Promise<void> {
  const modal = new ModalBuilder()
    .setCustomId(TempVcPanelId.build({ action: "limitm", channelId: channel.id }))
    .setTitle(t ? t("tempvc:modalLimitTitle") : "Set User Limit")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("limit")
          .setLabel(
            t
              ? t("tempvc:modalLimitLabel")
              : "User limit (0–99, 0 = unlimited)",
          )
          .setStyle(TextInputStyle.Short)
          .setMaxLength(2)
          .setValue(String(channel.userLimit || 0))
          .setRequired(true),
      ),
    );
  await interaction.showModal(modal);
}
