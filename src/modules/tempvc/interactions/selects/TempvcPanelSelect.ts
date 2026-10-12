import { roleMention, userMention } from "@discordjs/formatters";
import type {
  AnySelectMenuInteraction,
  GuildMember,
  VoiceBasedChannel,
} from "discord.js";
import { fetchTyped } from "#src/lib/i18n/Index.js";
import type { LumiT } from "#src/lib/i18n/Index.js";
import {
  acknowledge,
  defineInteraction,
} from "#src/lib/interactions/InteractionDef.js";
import type { Container } from "#src/lib/Services.js";
import { getUtility } from "#src/lib/module-system/Utility.js";
import { ephemeralCard, makeSuccessCard } from "#src/lib/ui/Cards.js";
import type { VcRecord } from "#src/modules/tempvc/data/Tempvc.js";
import { TempVcPanelId } from "#src/modules/tempvc/Constants.js";
import { showLimitModal, showRenameModal } from "#src/modules/tempvc/services/PanelHelpers.js";
import { resolveOwnedRecord } from "#src/modules/tempvc/services/PanelGuard.js";
import type { TempVcUtility } from "#src/modules/tempvc/utilities/TempVcUtility.js";
import {
  buildBackRows,
  buildBlockView,
  buildDeleteConfirmView,
  buildKickView,
  buildPanel,
  buildTransferView,
  buildTrustView,
  buildUnblockView,
  buildUntrustView,
} from "#src/modules/tempvc/ui/Panel.js";

const SelectActions = new Set([
  "select_kick",
  "select_trust",
  "select_trust_role",
  "select_untrust",
  "select_untrust_role",
  "select_block",
  "select_block_role",
  "select_unblock",
  "select_unblock_role",
  "select_transfer",
  "ksel",
  "tsel",
  "usel",
  "bsel",
  "ubsel",
  "xsel",
  "panelmenu",
]);

const AccessVerbKeys = {
  select_kick: "tempvc:accessVerbKicked",
  ksel: "tempvc:accessVerbKicked",
  select_trust: "tempvc:accessVerbTrusted",
  select_trust_role: "tempvc:accessVerbTrustedRole",
  tsel: "tempvc:accessVerbTrusted",
  select_untrust: "tempvc:accessVerbUntrusted",
  select_untrust_role: "tempvc:accessVerbUntrustedRole",
  usel: "tempvc:accessVerbUntrusted",
  select_block: "tempvc:accessVerbBlocked",
  select_block_role: "tempvc:accessVerbBlockedRole",
  bsel: "tempvc:accessVerbBlocked",
  select_unblock: "tempvc:accessVerbUnblocked",
  select_unblock_role: "tempvc:accessVerbUnblockedRole",
  ubsel: "tempvc:accessVerbUnblocked",
} as const;

export const tempVcPanelSelect = defineInteraction({
  prefix: TempVcPanelId.prefix,
  module: "tempvc",
  kinds: ["select"],
  async run(services: Container, interaction: AnySelectMenuInteraction): Promise<void> {
    const parsed = TempVcPanelId.parse(interaction.customId);
    if (!parsed || !SelectActions.has(parsed.action)) return;
    const { action, channelId } = parsed;
    const service: TempVcUtility = getUtility("tempvc");
    const { guildId } = interaction;
    if (!guildId) return;
    const channel = interaction.guild?.channels.cache.get(channelId);
    if (!channel || !channel.isVoiceBased()) return;

    const selected = action === "panelmenu" ? interaction.values[0] : undefined;
    const opensModal = selected === "name" || selected === "limit";
    if (!opensModal) await acknowledge(interaction);

    const member = interaction.member as GuildMember;
    const t = await fetchTyped(interaction);
    const record = await resolveOwnedRecord(
      guildId,
      channelId,
      channel,
      service,
      member,
      t,
    );
    if (!record) return;

    if (action === "panelmenu") {
      switch (selected) {
        case "name":
          await showRenameModal(interaction, channel, t);
          return;
        case "limit":
          await showLimitModal(interaction, channel, t);
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
        case "delete":
          await interaction.editReply(buildDeleteConfirmView(channel, t));
          return;
        default:
          return;
      }
    }

    const ids = interaction.values.filter((id) => id !== record.ownerId);

    const result =
      action === "select_transfer" || action === "xsel"
        ? await transfer(services, service, channel, record, interaction.values[0]!, t)
        : await applyAccess(services, channel, action, ids, t);

    const backRows = buildBackRows(channelId);

    await interaction.editReply(
      ephemeralCard(
        makeSuccessCard(t("tempvc:doneTitle"), result, {
          actionRows: backRows,
        }),
      ),
    );
    return undefined;
  },
});

async function applyAccess(
  services: Container,
  channel: VoiceBasedChannel,
  action: string,
  ids: string[],
  t: LumiT,
): Promise<string> {
    const done: string[] = [];
    const roleAction = action.endsWith("_role");
    for (const id of ids) {
      try {
        switch (action) {
          case "select_kick":
          case "ksel": {
            const m = channel.members.get(id);
            if (m) await m.voice.disconnect("Kicked from temp VC");
            done.push(userMention(id));
            break;
          }
          case "select_trust":
          case "select_trust_role":
          case "tsel": {
            await channel.permissionOverwrites.edit(id, {
              Connect: true,
              ViewChannel: true,
              Speak: true,
              Stream: true,
            });
            done.push(roleAction ? roleMention(id) : userMention(id));
            break;
          }
          case "select_block":
          case "select_block_role":
          case "bsel": {
            const m = channel.members.get(id);
            if (m) await m.voice.disconnect("Blocked from temp VC");
            await channel.permissionOverwrites.edit(id, {
              Connect: false,
              ViewChannel: false,
            });
            done.push(roleAction ? roleMention(id) : userMention(id));
            break;
          }
          case "select_untrust":
          case "select_untrust_role":
          case "select_unblock":
          case "select_unblock_role":
          case "usel":
          case "ubsel": {
            await channel.permissionOverwrites.delete(id);
            done.push(roleAction ? roleMention(id) : userMention(id));
            break;
          }
        }
      } catch (err: unknown) {
        services.logger.debug(
          `[tempvc] ${action} failed for ${id} in ${channel.id}: ${String(err)}`,
        );
      }
    }
    if (done.length === 0) return t("tempvc:noChangesApplied");
    const verbKey = AccessVerbKeys[action as keyof typeof AccessVerbKeys];
    const verb = verbKey ? t(verbKey) : t("tempvc:accessVerbProcessed");
    return t("tempvc:accessResult", { verb, members: done.join(", ") });
  }

async function transfer(
  services: Container,
  service: TempVcUtility,
  channel: VoiceBasedChannel,
  record: VcRecord,
  newOwnerId: string,
  t: LumiT,
): Promise<string> {
  const target = channel.members.get(newOwnerId);
  if (!target) return t("tempvc:memberNoLongerInChannel");
  await service.setOwner(services, channel, record, newOwnerId);
  return t("tempvc:ownershipTransferred", { user: userMention(newOwnerId) });
}
