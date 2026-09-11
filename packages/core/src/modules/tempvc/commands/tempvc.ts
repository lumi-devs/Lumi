import { ApplyOptions } from "@sapphire/decorators";
import type { ApplicationCommandRegistry } from "@sapphire/framework";
import { BaseCommand, replyError, sendReply, fetchTyped } from "#lib/commands.js";
import { type ChatInputCommandInteraction, type GuildMember } from "discord.js";
import { ephemeralCard } from "#lib/utilities/cards.js";
import { getVcRecord } from "../data.js";
import { buildPanel } from "../ui/panel.js";

@ApplyOptions<BaseCommand.Options>({
  name: "tempvc",
  description: "Open the control panel for your current temp VC.",
  preconditions: ["GuildOnly", "ModuleEnabled"],
  module: "tempvc",
})
export class TempVcCommand extends BaseCommand {
  public override registerApplicationCommands(
    registry: ApplicationCommandRegistry,
  ) {
    registry.registerChatInputCommand((builder) =>
      builder.setName(this.name).setDescription(this.description),
    );
  }

  public override async chatInputRun(
    interaction: ChatInputCommandInteraction,
  ): Promise<void> {
    const t = await fetchTyped(interaction);
    const member = interaction.member as GuildMember | null;
    const channel = member?.voice.channel;
    if (!channel) {
      return replyError(
        interaction,
        t("tempvc:notInVcTitle"),
        t("tempvc:notInVcMessage"),
      );
    }

    const record = await getVcRecord(interaction.guildId!, channel.id);
    if (!record) {
      return replyError(
        interaction,
        t("tempvc:unmanagedChannelTitle"),
        t("tempvc:unmanagedChannelMessage"),
      );
    }

    const panel = await buildPanel(channel, record, t);
    await sendReply(interaction, ephemeralCard(panel));
  }
}
