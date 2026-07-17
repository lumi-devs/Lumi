import {
  InteractionHandlerTypes,
  InteractionHandler,
  UserError,
} from "@sapphire/framework";
import { getService } from "#lib/module-system/Service.js";
import { ApplyOptions } from "@sapphire/decorators";
import type { GuildMember, ModalSubmitInteraction } from "discord.js";
import { BaseInteractionHandler } from "#lib/interaction-handler.js";
import { Emojis } from "#lib/utilities/assets.js";
import {
  ephemeralCard,
  makeErrorCard,
  makeSuccessCard,
} from "#lib/utilities/cards.js";
import { getVcRecord, setVcRecord } from "../data.js";
import { buildPanel } from "../ui/panel.js";
import { TVC } from "../keys.js";
import type TempVcService from "../services/TempVcService.js";

const KINDS = new Set(["namem", "limitm"]);

@ApplyOptions<InteractionHandler.Options>({
  name: "tempvc-modals",
  interactionHandlerType: InteractionHandlerTypes.ModalSubmit,
})
export default class TempVcModalHandler extends BaseInteractionHandler {
  private get service(): TempVcService {
    return getService("tempvc");
  }

  public override parse(interaction: ModalSubmitInteraction) {
    if (!interaction.customId.startsWith(`${TVC}:`)) return this.none();
    const [, kind, channelId] = interaction.customId.split(":");
    if (!kind || !channelId || !KINDS.has(kind)) return this.none();
    return this.some({ kind, channelId });
  }

  public async run(
    interaction: ModalSubmitInteraction,
    { kind, channelId }: { kind: string; channelId: string },
  ) {
    if (!interaction.inGuild()) return;
    const channel = interaction.guild?.channels.cache.get(channelId);
    if (!channel || !channel.isVoiceBased()) return;

    const record = await getVcRecord(interaction.guildId, channelId);
    if (!record) return;

    const member = interaction.member as GuildMember;
    if (
      member.id !== record.ownerId &&
      !this.service.canManage(member, channel)
    ) {
      throw new UserError({
        identifier: "TempVcNotOwner",
        message: `${Emojis.CROSS} Only the channel owner can use these controls.`,
      });
    }

    if (kind === "namem") {
      const name = interaction.fields.getTextInputValue("name").trim();
      if (!name) {
        return interaction.reply(
          ephemeralCard(
            makeErrorCard("Invalid Name", "Provide a non-empty name."),
          ),
        );
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
        return interaction.reply(
          ephemeralCard(
            makeErrorCard("Invalid Limit", "Enter a number between 0 and 99."),
          ),
        );
      }
      await channel.setUserLimit(limit, "Limit changed by owner");
    }

    const fresh = await getVcRecord(interaction.guildId, channelId);
    if (interaction.isFromMessage() && fresh) {
      return interaction.update(buildPanel(channel, fresh));
    }
    return interaction.reply(
      ephemeralCard(makeSuccessCard("✅ Updated", "Channel updated.")),
    );
  }
}
