import {
  InteractionHandler,
  InteractionHandlerTypes,
} from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import { roleMention, userMention } from "@discordjs/formatters";
import type {
  AnySelectMenuInteraction,
  GuildMember,
  VoiceBasedChannel,
} from "discord.js";
import { fetchTyped } from "#lib/commands.js";
import type { LumiT } from "#lib/i18n/index.js";
import { BaseInteractionHandler } from "#lib/interaction-handler.js";
import { getService } from "#lib/module-system/Service.js";
import { ephemeralCard, makeSuccessCard } from "#utilities/cards.js";
import { getVcRecord, type VcRecord } from "#modules/tempvc/data.js";
import { TVC } from "#modules/tempvc/keys.js";
import {
  assertOwner,
  showLimitModal,
  showRenameModal,
} from "#modules/tempvc/lib/panel-helpers.js";
import type TempVcService from "#modules/tempvc/services/TempVcService.js";
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
} from "#modules/tempvc/ui/panel.js";

const SELECT_ACTIONS = new Set([
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

const ACCESS_VERBS: Record<string, string> = {
  select_kick: "Kicked",
  ksel: "Kicked",
  select_trust: "Trusted",
  select_trust_role: "Trusted Role",
  tsel: "Trusted",
  select_untrust: "Untrusted",
  select_untrust_role: "Untrusted Role",
  usel: "Untrusted",
  select_block: "Blocked",
  select_block_role: "Blocked Role",
  bsel: "Blocked",
  select_unblock: "Unblocked",
  select_unblock_role: "Unblocked Role",
  ubsel: "Unblocked",
};

@ApplyOptions<InteractionHandler.Options>({
  name: "tempvc-panel-select",
  interactionHandlerType: InteractionHandlerTypes.SelectMenu,
})
export class TempVcPanelSelectHandler extends BaseInteractionHandler {
  private get service(): TempVcService {
    return getService("tempvc");
  }

  public override parse(interaction: AnySelectMenuInteraction) {
    if (!interaction.customId.startsWith(`${TVC}:`)) return this.none();
    const [, action, channelId] = interaction.customId.split(":");
    if (!action || !channelId || !SELECT_ACTIONS.has(action))
      return this.none();
    return this.some({ action, channelId });
  }

  public async run(
    interaction: AnySelectMenuInteraction,
    { action, channelId }: { action: string; channelId: string },
  ): Promise<void> {
    if (!interaction.inGuild()) return;
    const channel = interaction.guild?.channels.cache.get(channelId);
    if (!channel || !channel.isVoiceBased()) return;

    // showModal() must be the interaction's first response, so a "panelmenu"
    // pick of "name"/"limit" can't defer first; everything else defers
    // immediately to beat Discord's 3s ack window before the Redis/i18n
    // lookups below. `interaction.values` is available synchronously.
    const selected = action === "panelmenu" ? interaction.values[0] : undefined;
    const opensModal = selected === "name" || selected === "limit";
    if (!opensModal) await interaction.deferUpdate();

    const record = await getVcRecord(interaction.guildId, channelId);
    if (!record) return;

    const member = interaction.member as GuildMember;
    const t = await fetchTyped(interaction);
    assertOwner(this.service, member, channel, record.ownerId, t);

    if (action === "panelmenu") {
      switch (selected) {
        case "name":
          await showRenameModal(interaction, channel, t);
          return;
        case "limit":
          await showLimitModal(interaction, channel, t);
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
        ? await this.#transfer(channel, record, interaction.values[0]!, t)
        : await this.#applyAccess(channel, action, ids, t);

    const backRows = buildBackRows(channelId);

    await interaction.editReply(
      ephemeralCard(
        makeSuccessCard(t("tempvc:doneTitle"), result, {
          actionRows: backRows,
        }),
      ),
    );
    return undefined;
  }

  async #applyAccess(
    channel: VoiceBasedChannel,
    action: string,
    ids: string[],
    t: LumiT,
  ): Promise<string> {
    const done: string[] = [];
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
          case "tsel": {
            await channel.permissionOverwrites.edit(id, {
              Connect: true,
              ViewChannel: true,
              Speak: true,
              Stream: true,
            });
            done.push(userMention(id));
            break;
          }
          case "select_trust_role": {
            await channel.permissionOverwrites.edit(id, {
              Connect: true,
              ViewChannel: true,
              Speak: true,
              Stream: true,
            });
            done.push(roleMention(id));
            break;
          }
          case "select_block":
          case "bsel": {
            const m = channel.members.get(id);
            if (m) await m.voice.disconnect("Blocked from temp VC");
            await channel.permissionOverwrites.edit(id, {
              Connect: false,
              ViewChannel: false,
            });
            done.push(userMention(id));
            break;
          }
          case "select_block_role": {
            await channel.permissionOverwrites.edit(id, {
              Connect: false,
              ViewChannel: false,
            });
            done.push(roleMention(id));
            break;
          }
          case "select_untrust":
          case "select_unblock":
          case "usel":
          case "ubsel": {
            await channel.permissionOverwrites.delete(id);
            done.push(userMention(id));
            break;
          }
          case "select_untrust_role":
          case "select_unblock_role": {
            await channel.permissionOverwrites.delete(id);
            done.push(roleMention(id));
            break;
          }
        }
      } catch (err: unknown) {
        this.container.logger.debug(
          `[tempvc] ${action} failed for ${id} in ${channel.id}: ${String(err)}`,
        );
      }
    }
    if (done.length === 0) return t("tempvc:noChangesApplied");
    const verb = ACCESS_VERBS[action] ?? "Processed";
    return `${verb}: ${done.join(", ")}`;
  }

  async #transfer(
    channel: VoiceBasedChannel,
    record: VcRecord,
    newOwnerId: string,
    t: LumiT,
  ): Promise<string> {
    const target = channel.members.get(newOwnerId);
    if (!target) return t("tempvc:memberNoLongerInChannel");
    await this.service.setOwner(channel, record, newOwnerId);
    return t("tempvc:ownershipTransferred", { user: userMention(newOwnerId) });
  }
}
