import {
  InteractionHandlerTypes,
  InteractionHandler,
  UserError,
} from "@sapphire/framework";
import { getService } from "#lib/module-system/Service.js";
import { ApplyOptions } from "@sapphire/decorators";
import {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
} from "@discordjs/builders";
import {
  TextInputStyle,
  type MessageComponentInteraction,
  type AnySelectMenuInteraction,
  type ModalSubmitInteraction,
  type GuildMember,
  type VoiceBasedChannel,
  type ButtonInteraction,
} from "discord.js";
import { roleMention, userMention } from "@discordjs/formatters";
import { BaseInteractionHandler } from "#lib/interaction-handler.js";
import { Emojis } from "#utilities/assets.js";
import {
  ephemeralCard,
  makeErrorCard,
  makeSuccessCard,
} from "#utilities/cards.js";
import {
  createBackButton,
  buildSafeActionRows,
} from "#utilities/panels.js";
import { getVcRecord, removeVcRecord, setVcRecord, type VcRecord } from "../data.js";
import {
  buildPanel,
  buildKickView,
  buildTrustView,
  buildUntrustView,
  buildBlockView,
  buildUnblockView,
  buildTransferView,
  buildDeleteConfirmView,
} from "../ui/panel.js";
import { TVC, TempVcKeys } from "../keys.js";
import type TempVcService from "../services/TempVcService.js";
import { fetchTyped } from "#lib/commands.js";

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

const MODAL_KINDS = new Set(["namem", "limitm"]);

function assertOwner(
  service: TempVcService,
  member: GuildMember,
  channel: VoiceBasedChannel,
  ownerId: string,
  t?: import("#lib/i18n/index.js").LumiT,
) {
  if (member.id === ownerId) return;
  if (service.canManage(member, channel)) return;
  throw new UserError({
    identifier: "TempVcNotOwner",
    message: `${Emojis.CROSS} ${t ? t("tempvc:onlyOwner") : "Only the channel owner can use these controls."}`,
  });
}

function makeBackRow(channelId: string) {
  return buildSafeActionRows([
    new ActionRowBuilder<import("@discordjs/builders").ButtonBuilder>().addComponents(
      createBackButton(`${TVC}:panel:${channelId}`, "← Back to Panel"),
    ),
  ]);
}

async function showRenameModal(
  interaction: MessageComponentInteraction,
  channel: VoiceBasedChannel,
  t?: import("#lib/i18n/index.js").LumiT,
): Promise<void> {
  const modal = new ModalBuilder()
    .setCustomId(`${TVC}:namem:${channel.id}`)
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

async function showLimitModal(
  interaction: MessageComponentInteraction,
  channel: VoiceBasedChannel,
  t?: import("#lib/i18n/index.js").LumiT,
): Promise<void> {
  const modal = new ModalBuilder()
    .setCustomId(`${TVC}:limitm:${channel.id}`)
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

@ApplyOptions<InteractionHandler.Options>({
  name: "tempvc-panel-button",
  interactionHandlerType: InteractionHandlerTypes.Button,
})
export class TempVcPanelButtonHandler extends BaseInteractionHandler {
  private get service(): TempVcService {
    return getService("tempvc");
  }

  public override parse(interaction: import("discord.js").Interaction) {
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
    const t = await fetchTyped(interaction);
    const channel = interaction.guild?.channels.cache.get(channelId);
    if (!channel || !channel.isVoiceBased()) {
      throw new UserError({
        identifier: "TempVcGone",
        message: `${Emojis.CROSS} ${t("tempvc:channelNoLongerExists")}`,
      });
    }

    const record = await getVcRecord(interaction.guildId, channelId);
    if (!record) {
      throw new UserError({
        identifier: "TempVcUnmanaged",
        message: `${Emojis.CROSS} ${t("tempvc:channelNoLongerManaged")}`,
      });
    }

    const member = interaction.member as GuildMember;

    if (action === "claim") {
      await this.#claim(interaction, channel, record);
      return;
    }

    assertOwner(this.service, member, channel, record.ownerId, t);

    switch (action) {
      case "panel":
        await interaction.update(buildPanel(channel, record, t));
        return;
      case "name":
        await showRenameModal(interaction, channel, t);
        return;
      case "limit":
        await showLimitModal(interaction, channel, t);
        return;
      case "delete":
        await interaction.update(buildDeleteConfirmView(channel, t));
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
        await interaction.update(buildPanel(channel, next, t));
        return;
      }
      case "hide": {
        const next = await this.service.setHide(
          channel,
          record,
          !record.hidden,
        );
        await interaction.update(buildPanel(channel, next, t));
        return;
      }
      case "kick":
        await interaction.update(buildKickView(channel, record, t));
        return;
      case "trust":
        await interaction.update(buildTrustView(channel, record, t));
        return;
      case "untrust":
        await interaction.update(buildUntrustView(channel, record, t));
        return;
      case "block":
        await interaction.update(buildBlockView(channel, record, t));
        return;
      case "unblock":
        await interaction.update(buildUnblockView(channel, record, t));
        return;
      case "transfer":
        await interaction.update(buildTransferView(channel, record, t));
        return;
      default:
        return;
    }
  }

  async #doDelete(
    interaction: MessageComponentInteraction,
    channel: VoiceBasedChannel,
    t?: import("#lib/i18n/index.js").LumiT,
  ): Promise<void> {
    await interaction.deferUpdate();
    const { id, guildId } = channel;
    await channel.delete("Deleted by owner via panel").catch(() => null);
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
    await interaction.update(buildPanel(channel, next, t));
  }
}

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
    if (!action || !channelId || !SELECT_ACTIONS.has(action)) return this.none();
    return this.some({ action, channelId });
  }

  public async run(
    interaction: AnySelectMenuInteraction,
    { action, channelId }: { action: string; channelId: string },
  ): Promise<void> {
    if (!interaction.inGuild()) return;
    const channel = interaction.guild?.channels.cache.get(channelId);
    if (!channel || !channel.isVoiceBased()) return;

    const record = await getVcRecord(interaction.guildId, channelId);
    if (!record) return;

    const member = interaction.member as GuildMember;
    const t = await fetchTyped(interaction);
    assertOwner(this.service, member, channel, record.ownerId, t);

    if (action === "panelmenu") {
      const selected = interaction.values[0];
      switch (selected) {
        case "name":
          await showRenameModal(interaction, channel, t);
          return;
        case "limit":
          await showLimitModal(interaction, channel, t);
          return;
        case "lock": {
          const next = await this.service.setLock(channel, record, !record.locked);
          await interaction.update(buildPanel(channel, next, t));
          return;
        }
        case "hide": {
          const next = await this.service.setHide(channel, record, !record.hidden);
          await interaction.update(buildPanel(channel, next, t));
          return;
        }
        case "kick":
          await interaction.update(buildKickView(channel, record, t));
          return;
        case "trust":
          await interaction.update(buildTrustView(channel, record, t));
          return;
        case "untrust":
          await interaction.update(buildUntrustView(channel, record, t));
          return;
        case "block":
          await interaction.update(buildBlockView(channel, record, t));
          return;
        case "unblock":
          await interaction.update(buildUnblockView(channel, record, t));
          return;
        case "transfer":
          await interaction.update(buildTransferView(channel, record, t));
          return;
        case "delete":
          await interaction.update(buildDeleteConfirmView(channel, t));
          return;
        default:
          return;
      }
    }

    await interaction.deferUpdate();
    const ids = interaction.values.filter((id) => id !== record.ownerId);

    const result =
      action === "select_transfer" || action === "xsel"
        ? await this.#transfer(channel, record, interaction.values[0]!, t)
        : await this.#applyAccess(channel, action, ids, t);

    const backRows = makeBackRow(channelId);

    await interaction.editReply(
      ephemeralCard(
        makeSuccessCard(t("tempvc:doneTitle"), result, { actionRows: backRows }),
      ),
    );
    return undefined;
  }

  async #applyAccess(
    channel: VoiceBasedChannel,
    action: string,
    ids: string[],
    t: import("#lib/i18n/index.js").LumiT,
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
    const verb = {
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
    }[action] ?? "Processed";
    return `${verb}: ${done.join(", ")}`;
  }

  async #transfer(
    channel: VoiceBasedChannel,
    record: VcRecord,
    newOwnerId: string,
    t: import("#lib/i18n/index.js").LumiT,
  ): Promise<string> {
    const target = channel.members.get(newOwnerId);
    if (!target) return t("tempvc:memberNoLongerInChannel");
    await this.service.setOwner(channel, record, newOwnerId);
    return t("tempvc:ownershipTransferred", { user: userMention(newOwnerId) });
  }
}

@ApplyOptions<InteractionHandler.Options>({
  name: "tempvc-panel-modal",
  interactionHandlerType: InteractionHandlerTypes.ModalSubmit,
})
export class TempVcPanelModalHandler extends BaseInteractionHandler {
  private get service(): TempVcService {
    return getService("tempvc");
  }

  public override parse(interaction: ModalSubmitInteraction) {
    if (!interaction.customId.startsWith(`${TVC}:`)) return this.none();
    const [, kind, channelId] = interaction.customId.split(":");
    if (!kind || !channelId || !MODAL_KINDS.has(kind)) return this.none();
    return this.some({ kind, channelId });
  }

  public async run(
    interaction: ModalSubmitInteraction,
    { kind, channelId }: { kind: string; channelId: string },
  ): Promise<void> {
    if (!interaction.inGuild()) return;
    const channel = interaction.guild?.channels.cache.get(channelId);
    if (!channel || !channel.isVoiceBased()) return;

    const record = await getVcRecord(interaction.guildId, channelId);
    if (!record) return;
    const member = interaction.member as GuildMember;
    const t = await fetchTyped(interaction);
    assertOwner(this.service, member, channel, record.ownerId, t);

    if (kind === "namem") {
      const name = interaction.fields.getTextInputValue("name").trim();
      if (!name) {
        await interaction.reply(
          ephemeralCard(
            makeErrorCard(
              t("tempvc:invalidNameTitle"),
              t("tempvc:modalProvideNonEmptyName"),
              { actionRows: makeBackRow(channelId) },
            ),
          ),
        );
        return;
      }
      await channel.setName(name.slice(0, 100), "Renamed by owner");
      await setVcRecord(interaction.guildId, channelId, {
        ...record,
        name: channel.name,
      });
    } else {
      const raw = interaction.fields.getTextInputValue("limit").trim();
      const limit = Number.parseInt(raw, 10);
      if (Number.isNaN(limit) || limit < 0 || limit > 99) {
        await interaction.reply(
          ephemeralCard(
            makeErrorCard(
              t("tempvc:modalLimitTitle"),
              t("tempvc:modalEnterValidLimit"),
              { actionRows: makeBackRow(channelId) },
            ),
          ),
        );
        return;
      }
      await channel.setUserLimit(limit, "Limit changed by owner");
    }

    const fresh = await getVcRecord(interaction.guildId, channelId);
    if (interaction.isFromMessage() && fresh) {
      await interaction.update(buildPanel(channel, fresh, t));
      return;
    }
    await interaction.reply(
      ephemeralCard(
        makeSuccessCard(
          t("tempvc:updatedTitle"),
          t("tempvc:updatedMessage"),
          { actionRows: makeBackRow(channelId) },
        ),
      ),
    );
  }
}
