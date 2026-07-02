import {
  InteractionHandlerTypes,
  InteractionHandler,
  UserError,
} from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import {
  type AnySelectMenuInteraction,
  type GuildMember,
  type VoiceBasedChannel,
} from "discord.js";
import { userMention } from "@discordjs/formatters";
import { BaseInteractionHandler } from "#core/lib/interaction-handler.js";
import { Emojis } from "#utilities/assets.js";
import { makeSuccessCard } from "#utilities/cards.js";
import { getVcRecord, type VcRecord } from "../data.js";
import { TVC } from "../keys.js";
import type TempVcService from "../services/TempVcService.js";

const ACTIONS = new Set(["ksel", "tsel", "usel", "bsel", "ubsel", "xsel"]);

@ApplyOptions<InteractionHandler.Options>({
  name: "tempvc-selects",
  interactionHandlerType: InteractionHandlerTypes.SelectMenu,
})
export default class TempVcSelectHandler extends BaseInteractionHandler {
  private get service(): TempVcService {
    return this.container.stores.get("services").get("tempvc") as TempVcService;
  }

  public override parse(interaction: AnySelectMenuInteraction) {
    if (!interaction.customId.startsWith(`${TVC}:`)) return this.none();
    const [, action, channelId] = interaction.customId.split(":");
    if (!action || !channelId || !ACTIONS.has(action)) return this.none();
    return this.some({ action, channelId });
  }

  public async run(
    interaction: AnySelectMenuInteraction,
    { action, channelId }: { action: string; channelId: string },
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

    await interaction.deferUpdate();
    const ids = interaction.values.filter((id) => id !== record.ownerId);

    const result =
      action === "xsel"
        ? await this.#transfer(channel, record, interaction.values[0]!)
        : await this.#applyAccess(channel, action, ids);

    await interaction.editReply({
      ...makeSuccessCard("✅ Done", result),
      components: [],
    });
  }

  async #applyAccess(
    channel: VoiceBasedChannel,
    action: string,
    ids: string[],
  ): Promise<string> {
    const done: string[] = [];
    for (const id of ids) {
      try {
        switch (action) {
          case "ksel": {
            const m = channel.members.get(id);
            if (m) await m.voice.disconnect("Kicked from temp VC");
            break;
          }
          case "tsel":
            await channel.permissionOverwrites.edit(id, {
              Connect: true,
              ViewChannel: true,
              Speak: true,
              Stream: true,
            });
            break;
          case "bsel": {
            const m = channel.members.get(id);
            if (m) await m.voice.disconnect("Blocked from temp VC");
            await channel.permissionOverwrites.edit(id, {
              Connect: false,
              ViewChannel: false,
            });
            break;
          }
          case "usel":
          case "ubsel":
            await channel.permissionOverwrites.delete(id);
            break;
        }
        done.push(userMention(id));
      } catch {
        // skip members we can't act on
      }
    }
    if (done.length === 0) return "No changes applied.";
    const verb = {
      ksel: "Kicked",
      tsel: "Trusted",
      usel: "Untrusted",
      bsel: "Blocked",
      ubsel: "Unblocked",
    }[action];
    return `${verb}: ${done.join(", ")}`;
  }

  async #transfer(
    channel: VoiceBasedChannel,
    record: VcRecord,
    newOwnerId: string,
  ): Promise<string> {
    const target = channel.members.get(newOwnerId);
    if (!target) return "That member is no longer in the channel.";
    await this.service.setOwner(channel, record, newOwnerId);
    return `Ownership transferred to ${userMention(newOwnerId)}.`;
  }
}
