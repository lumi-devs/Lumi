import { ApplyOptions } from "@sapphire/decorators";
import { getService } from "#core/module-system/Service.js";
import { Args, Command } from "@sapphire/framework";
import { type GuildMember, type Message } from "discord.js";
import { BaseCommand } from "#lib/commands.js";
import { makeInfoCard, ephemeralCard } from "#utilities/cards.js";
import { AFK_MAX_REASON_LENGTH, sanitizeReason } from "../index.js";
import { Emojis } from "#utilities/assets.js";
import type AfkService from "../services/AfkService.js";

function afkStatusText(
  status: "ALREADY_AFK" | "UPDATED_AFK" | "NEW_AFK",
  reason: string,
): { title: string; body: string } {
  if (status === "ALREADY_AFK") {
    return {
      title: "Already AFK",
      body: `You are already AFK with the reason: **${reason}**`,
    };
  }
  if (status === "UPDATED_AFK") {
    return {
      title: `${Emojis.EDIT} AFK Updated`,
      body: `AFK reason updated to: **${reason}**`,
    };
  }
  return {
    title: `${Emojis.AFK} AFK Set`,
    body: `You are now AFK: **${reason}**`,
  };
}

@ApplyOptions<Command.Options>({
  name: "afk",
  description: "Set yourself AFK with an optional reason.",
  preconditions: ["GuildOnly", "ModuleEnabled"],
  module: "afk",
})
export default class AfkCommand extends BaseCommand {
  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName(this.name)
        .setDescription(this.description)
        .addStringOption((opt) =>
          opt
            .setName("reason")
            .setDescription("The reason for being AFK")
            .setMaxLength(AFK_MAX_REASON_LENGTH)
            .setRequired(false),
        ),
    );
  }

  private get afkService(): AfkService {
    return getService("afk");
  }

  public override async chatInputRun(
    interaction: Command.ChatInputCommandInteraction,
  ) {
    const reason = sanitizeReason(
      interaction.options.getString("reason") ?? "AFK",
    );
    const guildId = interaction.guildId!;
    const member = interaction.member as GuildMember | null;

    const { status } = await this.afkService.setAfk(
      guildId,
      member,
      interaction.user,
      reason,
    );

    const { title, body } = afkStatusText(status, reason);
    return this.reply(interaction, ephemeralCard(makeInfoCard(title, body)));
  }

  public override async messageRun(message: Message, args: Args) {
    if (!message.inGuild()) return;

    const reason = (await args.rest("string").catch(() => undefined)) ?? "AFK";
    const cleanedReason = sanitizeReason(reason);
    const { member } = message;
    const user = message.author;

    const { status } = await this.afkService.setAfk(
      message.guildId,
      member,
      user,
      cleanedReason,
    );

    const { title, body } = afkStatusText(status, cleanedReason);
    return message.reply({ ...makeInfoCard(title, body), allowedMentions: {} });
  }
}
