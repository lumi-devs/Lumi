import { roleMention, userMention } from "@discordjs/formatters";
import type {
  AnySelectMenuInteraction,
  GuildMember,
  VoiceBasedChannel,
} from "discord.js";
import { fetchTyped } from "@i18n/Index.js";
import type { LumiT } from "@i18n/Index.js";
import {
  acknowledge,
  defineInteraction,
} from "@interactions/InteractionDef.js";
import type { Container } from "@lib/Services.js";
import { getUtility } from "@module-system/Utility.js";
import { ephemeralCard, makeSuccessCard } from "@ui/Cards.js";
import type { VcRecord } from "@modules/tempvc/data/Tempvc.js";
import { TempVcPanelId } from "@modules/tempvc/Constants.js";
import { handlePanelMenuAction } from "@modules/tempvc/services/PanelHelpers.js";
import { resolveOwnedRecord } from "@modules/tempvc/services/PanelGuard.js";
import type { TempVcUtility } from "@modules/tempvc/utilities/TempVcUtility.js";
import { buildBackRows } from "@modules/tempvc/ui/Panel.js";

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
      services,
    );
    if (!record) return;

    if (action === "panelmenu") {
      await handlePanelMenuAction(
        services,
        service,
        interaction,
        channel,
        record,
        selected ?? "",
        t,
      );
      return;
    }

    const ids = interaction.values.filter((id) => id !== record.ownerId);

    const firstValue = interaction.values[0];
    if (!firstValue) return;
    const result =
      action === "select_transfer" || action === "xsel"
        ? await transfer(services, service, channel, record, firstValue, t)
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
            const member = channel.members.get(id);
            if (member) await member.voice.disconnect("Kicked from temp VC");
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
            const member = channel.members.get(id);
            if (member) await member.voice.disconnect("Blocked from temp VC");
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
