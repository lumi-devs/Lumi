import type { CommandContext } from "#lib/command-context.js";
import type { CommandDef } from "#lib/commands/command-def.js";
import { replyError, sendReply, fetchTyped } from "#lib/commands.js";
import { SlashCommandBuilder, type ChatInputCommandInteraction, type GuildMember } from "discord.js";
import { ephemeralCard } from "#lib/ui/cards.js";
import { getVcRecord } from "../data/tempvc.js";
import { buildPanel } from "../ui/panel.js";

export const tempvcDef: CommandDef = {
  name: "tempvc",
  module: "tempvc",
  description: "Open the control panel for your current temp VC.",
  guildOnly: true,
  build: () => {
    const builder = new SlashCommandBuilder().setName("tempvc");
    return (
    builder.setName("tempvc").setDescription("Open the control panel for your current temp VC.")
    );
  },
  run: async (ctx: CommandContext) => { const interaction: ChatInputCommandInteraction = ctx.interaction;
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

    const record = await getVcRecord(ctx.services, interaction.guildId!, channel.id);
    if (!record) {
      return replyError(
        interaction,
        t("tempvc:unmanagedChannelTitle"),
        t("tempvc:unmanagedChannelMessage"),
      );
    }

    const panel = await buildPanel(ctx.services, channel, record, t);
    await sendReply(interaction, ephemeralCard(panel));
  }
};
