import {
  InteractionHandlerTypes,
  InteractionHandler,
  UserError,
} from "@sapphire/framework";
import { getService } from "#lib/module-system/Service.js";
import { ApplyOptions } from "@sapphire/decorators";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  UserSelectMenuBuilder,
} from "@discordjs/builders";
import {
  ButtonStyle,
  TextInputStyle,
  type MessageComponentInteraction,
  type GuildMember,
  type VoiceBasedChannel,
} from "discord.js";
import { BaseInteractionHandler } from "#lib/interaction-handler.js";
import { Emojis } from "#lib/utilities/assets.js";
import {
  ephemeralCard,
  makeErrorCard,
  makeInfoCard,
  makeSuccessCard,
} from "#lib/utilities/cards.js";
import { getVcRecord, removeVcRecord, type VcRecord } from "../data.js";
import { buildPanel } from "../ui/panel.js";
import { TVC, TempVcKeys } from "../keys.js";
import type TempVcService from "../services/TempVcService.js";
import { fetchTyped } from "#lib/commands.js";

const SELECT_ACTIONS: Record<string, string> = {
  kick: "ksel",
  trust: "tsel",
  untrust: "usel",
  block: "bsel",
  unblock: "ubsel",
  transfer: "xsel",
};

const SELECT_PLACEHOLDER: Record<string, string> = {
  ksel: "Select members to kick…",
  tsel: "Select member to trust…",
  usel: "Select member to untrust…",
  bsel: "Select member to block…",
  ubsel: "Select member to unblock…",
  xsel: "Select new channel owner…",
};

@ApplyOptions<InteractionHandler.Options>({
  name: "tempvc-buttons",
  interactionHandlerType: InteractionHandlerTypes.Button,
})
export default class TempVcButtonHandler extends BaseInteractionHandler {
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
    interaction: import("discord.js").Interaction,
    { action, channelId }: { action: string; channelId: string },
  ) {
    if (!interaction.isMessageComponent()) return;
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

    if (action === "claim") return this.#claim(interaction, channel, record);

    this.#assertOwner(member, channel, record.ownerId, t);

    switch (action) {
      case "name":
        return this.#openRenameModal(interaction, channel, t);
      case "limit":
        return this.#openLimitModal(interaction, channel, t);
      case "delete":
        return this.#confirmDelete(interaction, channelId, t);
      case "delyes":
        return this.#doDelete(interaction, channel, t);
      case "lock": {
        const next = await this.service.setLock(
          channel,
          record,
          !record.locked,
        );
        return interaction.update(buildPanel(channel, next, t));
      }
      case "hide": {
        const next = await this.service.setHide(
          channel,
          record,
          !record.hidden,
        );
        return interaction.update(buildPanel(channel, next, t));
      }
      case "kick":
        return this.#openKickSelect(interaction, channel, record, t);
      case "trust":
      case "untrust":
      case "block":
      case "unblock":
      case "transfer":
        return this.#openUserSelect(interaction, channelId, action);
      default:
        return undefined;
    }
  }

  #assertOwner(
    member: GuildMember,
    channel: VoiceBasedChannel,
    ownerId: string,
    t?: import("#lib/i18n/index.js").LumiT,
  ) {
    if (member.id === ownerId) return;
    if (this.service.canManage(member, channel)) return;
    throw new UserError({
      identifier: "TempVcNotOwner",
      message: `${Emojis.CROSS} ${t ? t("tempvc:onlyOwner") : "Only the channel owner can use these controls."}`,
    });
  }

  async #openRenameModal(
    interaction: MessageComponentInteraction,
    channel: VoiceBasedChannel,
    t?: import("#lib/i18n/index.js").LumiT,
  ) {
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
    return interaction.showModal(modal);
  }

  async #openLimitModal(
    interaction: MessageComponentInteraction,
    channel: VoiceBasedChannel,
    t?: import("#lib/i18n/index.js").LumiT,
  ) {
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
    return interaction.showModal(modal);
  }

  #confirmDelete(
    interaction: MessageComponentInteraction,
    channelId: string,
    t?: import("#lib/i18n/index.js").LumiT,
  ) {
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${TVC}:delyes:${channelId}`)
        .setLabel(t ? t("tempvc:confirmDeleteButton") : "Confirm Delete")
        .setStyle(ButtonStyle.Danger),
    );
    return interaction.reply(
      ephemeralCard(
        makeErrorCard(
          t ? t("tempvc:deleteCardTitle") : "🗑️ Delete Channel?",
          t
            ? t("tempvc:deleteCardText")
            : "This permanently deletes the voice channel.",
          { actionRows: [row] },
        ),
      ),
    );
  }

  async #doDelete(
    interaction: MessageComponentInteraction,
    channel: VoiceBasedChannel,
    t?: import("#lib/i18n/index.js").LumiT,
  ) {
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
      })
      .catch(() => null);
  }

  async #openKickSelect(
    interaction: MessageComponentInteraction,
    channel: VoiceBasedChannel,
    record: VcRecord,
    t?: import("#lib/i18n/index.js").LumiT,
  ) {
    const eligible = [...channel.members.values()].filter(
      (m) => !m.user.bot && m.id !== record.ownerId,
    );
    if (eligible.length === 0) {
      return interaction.reply(
        ephemeralCard(
          makeErrorCard(
            t ? t("tempvc:nobodyToKickTitle") : "Nobody to Kick",
            t
              ? t("tempvc:nobodyToKickMessage")
              : "There's no one else in the channel.",
          ),
        ),
      );
    }
    const menu = new StringSelectMenuBuilder()
      .setCustomId(`${TVC}:ksel:${channel.id}`)
      .setPlaceholder(
        t ? t("tempvc:selectKickPlaceholder") : "Select members to kick…",
      )
      .setMinValues(1)
      .setMaxValues(eligible.length)
      .addOptions(
        eligible.map((m) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(m.displayName.slice(0, 100))
            .setValue(m.id),
        ),
      );
    return interaction.reply(
      ephemeralCard(
        makeInfoCard(
          t ? t("tempvc:kickMembersTitle") : "Kick Members",
          t ? t("tempvc:kickMembersMessage") : "Select members to kick:",
          {
            actionRows: [
              new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
                menu,
              ),
            ],
          },
        ),
      ),
    );
  }

  async #openUserSelect(
    interaction: MessageComponentInteraction,
    channelId: string,
    action: string,
  ) {
    const sel = SELECT_ACTIONS[action]!;
    const menu = new UserSelectMenuBuilder()
      .setCustomId(`${TVC}:${sel}:${channelId}`)
      .setPlaceholder(SELECT_PLACEHOLDER[sel]!)
      .setMinValues(1)
      .setMaxValues(action === "transfer" ? 1 : 10);
    return interaction.reply(
      ephemeralCard(
        makeInfoCard(SELECT_PLACEHOLDER[sel]!, "Make a selection below:", {
          actionRows: [
            new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(menu),
          ],
        }),
      ),
    );
  }

  async #claim(
    interaction: MessageComponentInteraction,
    channel: VoiceBasedChannel,
    record: { ownerId: string },
  ) {
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
