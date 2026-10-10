import { UserError } from "@lumi/shared";
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
import type { LumiT } from "@lumi/lib/i18n/index.js";
import { TempVcPanelId } from "@lumi/modules/tempvc/constants.js";
import type { TempVcUtility } from "@lumi/modules/tempvc/utilities/TempVcUtility.js";

/**
 * @remarks
 *
 * Staff pass through {@linkcode TempVcUtility.canManage} even when they do not
 * own the channel, so this is not a plain owner-id comparison.
 */
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

/**
 * @remarks
 *
 * Discord rejects `showModal` on an already-acknowledged interaction, so this
 * must be the first response — never defer before calling it.
 */
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

/**
 * @remarks
 *
 * Discord rejects `showModal` on an already-acknowledged interaction, so this
 * must be the first response — never defer before calling it.
 */
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
