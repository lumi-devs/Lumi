import { ApplyOptions } from "@sapphire/decorators";
import { Args, Command } from "@sapphire/framework";
import {
  ContainerBuilder,
  SeparatorBuilder,
  TextDisplayBuilder,
} from "@discordjs/builders";
import {
  ApplicationIntegrationType,
  MessageFlags,
  SeparatorSpacingSize,
  type GuildMember,
  type Message,
} from "discord.js";
import { EmberCommand } from "#lib/commands.js";
import { EmberColors } from "#utilities/branding.js";
import { AFK_MAX_REASON_LENGTH, sanitizeReason } from "../index.js";
import { EmberEmojis } from "#utilities/assets.js";

function afkCard(title: string, body: string) {
  const c = new ContainerBuilder();
  c.setAccentColor(EmberColors.PRIMARY);
  c.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`**${title}**`),
  );
  c.addSeparatorComponents(
    new SeparatorBuilder()
      .setSpacing(SeparatorSpacingSize.Small)
      .setDivider(true),
  );
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(body));
  return { flags: MessageFlags.IsComponentsV2 as number, components: [c] };
}

@ApplyOptions<Command.Options>({
  name: "afk",
  description: "Set yourself AFK with an optional reason.",
  preconditions: ["GuildOnly", "ModuleEnabled"],
  module: "afk",
})
export default class AfkCommand extends EmberCommand {
  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName(this.name)
        .setDescription(this.description)
        .setDefaultMemberPermissions(this.defaultMemberPermissions ?? null)
        .setContexts(...this.contexts)
        .setIntegrationTypes([ApplicationIntegrationType.GuildInstall])
        .addStringOption((opt) =>
          opt
            .setName("reason")
            .setDescription("The reason for being AFK")
            .setMaxLength(AFK_MAX_REASON_LENGTH)
            .setRequired(false),
        ),
    );
  }

  private get afkService(): import("../services/AfkService.js").default {
    return this.container.stores
      .get("services")
      .get("afk") as import("../services/AfkService.js").default;
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

    const title =
      status === "ALREADY_AFK"
        ? "Already AFK"
        : status === "UPDATED_AFK"
          ? `${EmberEmojis.EDIT} AFK Updated`
          : `${EmberEmojis.AFK} AFK Set`;
    const body =
      status === "ALREADY_AFK"
        ? `You are already AFK with the reason: **${reason}**`
        : status === "UPDATED_AFK"
          ? `AFK reason updated to: **${reason}**`
          : `You are now AFK: **${reason}**`;

    const card = afkCard(title, body);
    return this.reply(interaction, {
      ...card,
      flags: card.flags | MessageFlags.Ephemeral,
    });
  }

  public override async messageRun(message: Message, args: Args) {
    if (!message.inGuild()) return;

    const reason =
      args.getOption("reason") ??
      (await args.rest("string").catch(() => undefined)) ??
      "AFK";
    const cleanedReason = sanitizeReason(reason);
    const { member } = message;
    const user = message.author;

    const { status } = await this.afkService.setAfk(
      message.guildId,
      member,
      user,
      cleanedReason,
    );

    const title =
      status === "ALREADY_AFK"
        ? "Already AFK"
        : status === "UPDATED_AFK"
          ? `${EmberEmojis.EDIT} AFK Updated`
          : `${EmberEmojis.AFK} AFK Set`;
    const body =
      status === "ALREADY_AFK"
        ? `You are already AFK with the reason: **${cleanedReason}**`
        : status === "UPDATED_AFK"
          ? `AFK reason updated to: **${cleanedReason}**`
          : `You are now AFK: **${cleanedReason}**`;

    const card = afkCard(title, body);
    return message.reply({
      ...card,
      allowedMentions: {},
    });
  }
}
