import { ApplyOptions } from "@sapphire/decorators";
import { Command } from "@sapphire/framework";
import { ChannelType } from "discord.js";
import { BaseCommand, type CommandContext } from "#lib/commands.js";
import { sendWelcomeCard } from "../lib/send.js";
import { loadWelcomeConfig } from "../lib/config.js";
import {
  buildDmWelcomeCard,
  buildGoodbyeCard,
  buildWelcomeCard,
  renderWelcomeTemplate,
  templateVarsFor,
} from "../lib/template.js";

const PreviewKinds = ["welcome", "goodbye", "dm"] as const;
type PreviewKind = (typeof PreviewKinds)[number];

function parseKind(raw: string | null): PreviewKind {
  return (PreviewKinds as readonly string[]).includes(raw ?? "")
    ? (raw as PreviewKind)
    : "welcome";
}

@ApplyOptions<BaseCommand.Options>({
  name: "welcome",
  description: "Preview the welcome, goodbye, or DM greeting card.",
  preconditions: ["GuildOnly", "ModuleEnabled"],
  module: "welcome",
  requiredPermit: "admin.welcome",
  prefixEnabled: true,
})
export class WelcomeCommand extends BaseCommand {
  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName(this.name)
        .setDescription(this.description)
        .addStringOption((opt) =>
          opt
            .setName("message")
            .setDescription("Which card to preview.")
            .addChoices(
              { name: "Welcome", value: "welcome" },
              { name: "Goodbye", value: "goodbye" },
              { name: "DM greeting", value: "dm" },
            )
            .setRequired(false),
        )
        .addUserOption((opt) =>
          opt
            .setName("member")
            .setDescription("Member to render the card for (defaults to you).")
            .setRequired(false),
        )
        .addChannelOption((opt) =>
          opt
            .setName("channel")
            .setDescription(
              "Post the preview into this channel (defaults to an ephemeral reply).",
            )
            .addChannelTypes(
              ChannelType.GuildText,
              ChannelType.GuildAnnouncement,
            )
            .setRequired(false),
        ),
    );
  }

  public override async run(ctx: CommandContext) {
    const guild = ctx.guild;
    if (!guild) {
      return ctx.replyError("No server", "This command can only be used in a server.");
    }
    const kind = parseKind(await ctx.getString("message"));
    const target = (await ctx.getUser("member")) ?? ctx.user;
    const targetMember = await guild.members.fetch(target.id).catch(() => null);
    const config = await loadWelcomeConfig(guild.id);
    const vars = templateVarsFor(
      target.id,
      target.username,
      targetMember?.nickname ?? null,
      target.displayAvatarURL(),
      guild.name,
      guild.id,
      guild.iconURL(),
      guild.memberCount,
    );

    const card =
      kind === "goodbye"
        ? buildGoodbyeCard(renderWelcomeTemplate(config.goodbyeTemplate, vars))
        : kind === "dm"
          ? buildDmWelcomeCard(
              guild.name,
              renderWelcomeTemplate(config.dmWelcomeTemplate, vars),
            )
          : buildWelcomeCard(
              renderWelcomeTemplate(config.welcomeTemplate, vars),
              config.autoRoles.length > 0
                ? `Auto-role${config.autoRoles.length === 1 ? "" : "s"}: ${config.autoRoles.map((id) => `<@&${id}>`).join(" ")}`
                : undefined,
              {
                accentColor: config.welcomeAccentColor,
                imageUrls: config.welcomeImageUrls,
                footer: config.welcomeFooter,
                buttons: config.welcomeActionButtons,
              },
            );

    const destination = await ctx.getChannel("channel");
    if (destination) {
      const posted = await sendWelcomeCard(
        guild,
        destination.id,
        card,
        "Welcome: Preview send failed",
      );
      if (posted) {
        return ctx.replySuccess(
          "Preview posted",
          `Posted the ${kind} preview into <#${destination.id}>.`,
        );
      }
      return ctx.replyError(
        "Cannot post there",
        "That channel is not sendable. Run /welcome without a channel to see the preview here.",
      );
    }
    return ctx.reply(card);
  }
}
