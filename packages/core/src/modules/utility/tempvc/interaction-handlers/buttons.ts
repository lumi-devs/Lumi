import {
  InteractionHandlerTypes,
  InteractionHandler,
  UserError,
} from "@sapphire/framework";
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
  type ButtonInteraction,
  type GuildMember,
  type VoiceBasedChannel,
} from "discord.js";
import { BaseInteractionHandler } from "#core/lib/interaction-handler.js";
import { Emojis } from "#utilities/assets.js";
import {
  ephemeralCard,
  makeErrorCard,
  makeInfoCard,
  makeSuccessCard,
} from "#utilities/cards.js";
import { getVcRecord, removeVcRecord, type VcRecord } from "../data.js";
import { buildPanel } from "../ui/panel.js";
import { TVC, TempVcKeys } from "../keys.js";
import type TempVcService from "../services/TempVcService.js";

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
  tsel: "Select members to trust…",
  usel: "Select members to untrust…",
  bsel: "Select members to block…",
  ubsel: "Select members to unblock…",
  xsel: "Select the new owner…",
};

@ApplyOptions<InteractionHandler.Options>({
  name: "tempvc-buttons",
  interactionHandlerType: InteractionHandlerTypes.Button,
})
export default class TempVcButtonHandler extends BaseInteractionHandler {
  private get service(): TempVcService {
    return this.container.stores.get("services").get("tempvc") as TempVcService;
  }

  public override parse(interaction: ButtonInteraction) {
    if (!interaction.customId.startsWith(`${TVC}:`)) return this.none();
    const [, action, channelId] = interaction.customId.split(":");
    if (!action || !channelId) return this.none();
    return this.some({ action, channelId });
  }

  public async run(
    interaction: ButtonInteraction,
    { action, channelId }: { action: string; channelId: string },
  ) {
    if (!interaction.inGuild()) return;
    const channel = interaction.guild?.channels.cache.get(channelId);
    if (!channel || !channel.isVoiceBased()) {
      throw new UserError({
        identifier: "TempVcGone",
        message: `${Emojis.CROSS} This voice channel no longer exists.`,
      });
    }
    const record = await getVcRecord(interaction.guildId, channelId);
    if (!record) {
      throw new UserError({
        identifier: "TempVcUnmanaged",
        message: `${Emojis.CROSS} This channel is no longer managed.`,
      });
    }

    const member = interaction.member as GuildMember;

    // Claim is the only action usable by non-owners.
    if (action === "claim") return this.#claim(interaction, channel, record);

    this.#assertOwner(member, channel, record.ownerId);

    switch (action) {
      case "name":
        return this.#openRenameModal(interaction, channel);
      case "limit":
        return this.#openLimitModal(interaction, channel);
      case "delete":
        return this.#confirmDelete(interaction, channelId);
      case "delyes":
        return this.#doDelete(interaction, channel);
      case "lock": {
        const next = await this.service.setLock(
          channel,
          record,
          !record.locked,
        );
        return interaction.update(buildPanel(channel, next));
      }
      case "hide": {
        const next = await this.service.setHide(
          channel,
          record,
          !record.hidden,
        );
        return interaction.update(buildPanel(channel, next));
      }
      case "kick":
        return this.#openKickSelect(interaction, channel, record);
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
  ) {
    if (member.id === ownerId) return;
    if (this.service.canManage(member, channel)) return;
    throw new UserError({
      identifier: "TempVcNotOwner",
      message: `${Emojis.CROSS} Only the channel owner can use these controls.`,
    });
  }

  async #openRenameModal(
    interaction: ButtonInteraction,
    channel: VoiceBasedChannel,
  ) {
    const modal = new ModalBuilder()
      .setCustomId(`${TVC}:namem:${channel.id}`)
      .setTitle("Rename Voice Channel")
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId("name")
            .setLabel("New name")
            .setStyle(TextInputStyle.Short)
            .setMaxLength(100)
            .setValue(channel.name)
            .setRequired(true),
        ),
      );
    return interaction.showModal(modal);
  }

  async #openLimitModal(
    interaction: ButtonInteraction,
    channel: VoiceBasedChannel,
  ) {
    const modal = new ModalBuilder()
      .setCustomId(`${TVC}:limitm:${channel.id}`)
      .setTitle("Set User Limit")
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId("limit")
            .setLabel("User limit (0–99, 0 = unlimited)")
            .setStyle(TextInputStyle.Short)
            .setMaxLength(2)
            .setValue(String(channel.userLimit || 0))
            .setRequired(true),
        ),
      );
    return interaction.showModal(modal);
  }

  #confirmDelete(interaction: ButtonInteraction, channelId: string) {
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${TVC}:delyes:${channelId}`)
        .setLabel("Confirm Delete")
        .setStyle(ButtonStyle.Danger),
    );
    return interaction.reply(
      ephemeralCard(
        makeErrorCard(
          "🗑️ Delete Channel?",
          "This permanently deletes the voice channel.",
          { actionRows: [row] },
        ),
      ),
    );
  }

  async #doDelete(interaction: ButtonInteraction, channel: VoiceBasedChannel) {
    await interaction.deferUpdate();
    const { id, guildId } = channel;
    await channel.delete("Deleted by owner via panel").catch(() => null);
    if (guildId) await removeVcRecord(guildId, id);
    await interaction
      .editReply({
        ...makeSuccessCard("✅ Deleted", "Voice channel deleted."),
      })
      .catch(() => null);
  }

  async #openKickSelect(
    interaction: ButtonInteraction,
    channel: VoiceBasedChannel,
    record: VcRecord,
  ) {
    const eligible = [...channel.members.values()].filter(
      (m) => !m.user.bot && m.id !== record.ownerId,
    );
    if (eligible.length === 0) {
      return interaction.reply(
        ephemeralCard(
          makeErrorCard(
            "Nobody to Kick",
            "There's no one else in the channel.",
          ),
        ),
      );
    }
    const menu = new StringSelectMenuBuilder()
      .setCustomId(`${TVC}:ksel:${channel.id}`)
      .setPlaceholder("Select members to kick…")
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
        makeInfoCard("Kick Members", "Select members to kick:", {
          actionRows: [
            new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu),
          ],
        }),
      ),
    );
  }

  async #openUserSelect(
    interaction: ButtonInteraction,
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
    interaction: ButtonInteraction,
    channel: VoiceBasedChannel,
    record: { ownerId: string },
  ) {
    const member = interaction.member as GuildMember;
    if (member.voice.channelId !== channel.id) {
      throw new UserError({
        identifier: "TempVcClaimNotIn",
        message: `${Emojis.CROSS} You must be in the channel to claim it.`,
      });
    }
    const owner = channel.members.get(record.ownerId);
    if (owner) {
      throw new UserError({
        identifier: "TempVcOwnerPresent",
        message: `${Emojis.CROSS} The owner is still here — you can't claim it.`,
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
        message: `${Emojis.LOADING} Someone else is claiming — try again.`,
      });
    }

    const fullRecord = (await getVcRecord(interaction.guildId!, channel.id))!;
    const next = await this.service.setOwner(channel, fullRecord, member.id);
    await interaction.update(buildPanel(channel, next));
  }
}
