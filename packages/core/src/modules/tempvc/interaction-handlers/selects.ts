import {
  InteractionHandlerTypes,
  InteractionHandler,
  UserError,
} from "@sapphire/framework";
import { getService } from "#lib/module-system/Service.js";
import { ApplyOptions } from "@sapphire/decorators";
import {
  type AnySelectMenuInteraction,
  type GuildMember,
  type VoiceBasedChannel,
} from "discord.js";
import { userMention } from "@discordjs/formatters";
import { BaseInteractionHandler } from "#lib/interaction-handler.js";
import { Emojis } from "#lib/utilities/assets.js";
import { makeSuccessCard } from "#lib/utilities/cards.js";
import { getVcRecord, type VcRecord } from "../data.js";
import { TVC } from "../keys.js";
import type TempVcService from "../services/TempVcService.js";
import { fetchTyped } from "#lib/commands.js";

const ACTIONS = new Set(["ksel", "tsel", "usel", "bsel", "ubsel", "xsel"]);

@ApplyOptions<InteractionHandler.Options>({
  name: "tempvc-selects",
  interactionHandlerType: InteractionHandlerTypes.SelectMenu,
})
export default class TempVcSelectHandler extends BaseInteractionHandler {
  private get service(): TempVcService {
    return getService("tempvc");
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
    const t = await fetchTyped(interaction);
    if (
      member.id !== record.ownerId &&
      !this.service.canManage(member, channel)
    ) {
      throw new UserError({
        identifier: "TempVcNotOwner",
        message: `${Emojis.CROSS} ${t("tempvc:onlyOwner")}`,
      });
    }

    await interaction.deferUpdate();
    const ids = interaction.values.filter((id) => id !== record.ownerId);

    const result =
      action === "xsel"
        ? await this.#transfer(channel, record, interaction.values[0]!, t)
        : await this.#applyAccess(channel, action, ids, t);

    await interaction.editReply({
      ...makeSuccessCard(t("tempvc:doneTitle"), result),
      components: [],
    });
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
      } catch {}
    }
    if (done.length === 0) return t("tempvc:noChangesApplied");
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
    t: import("#lib/i18n/index.js").LumiT,
  ): Promise<string> {
    const target = channel.members.get(newOwnerId);
    if (!target) return t("tempvc:memberNoLongerInChannel");
    await this.service.setOwner(channel, record, newOwnerId);
    return t("tempvc:ownershipTransferred", { user: userMention(newOwnerId) });
  }
}
