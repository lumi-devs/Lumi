import type { CommandDef } from "#lib/commands/command-def.js";
import { SlashCommandBuilder, ChannelType } from "discord.js";
import type { CommandContext } from "#lib/commands/context.js";
import { sendWelcomeCard } from "@lumi/application/services/welcome/welcome.js";
import { loadWelcomeConfig } from "@lumi/application/services/welcome/welcome.js";
import { buildDmWelcomeCard, renderGoodbyeCard, renderWelcomeCard, renderWelcomeTemplate, templateVarsFor } from "@lumi/application/services/welcome/welcome.js";

const PreviewKinds = ["welcome", "goodbye", "dm"] as const;
type PreviewKind = (typeof PreviewKinds)[number];

function parseKind(raw: string | null): PreviewKind {
  return (PreviewKinds as readonly string[]).includes(raw ?? "")
    ? (raw as PreviewKind)
    : "welcome";
}

export const welcomeDef: CommandDef = {
  name: "welcome",
  module: "welcome",
  description: "Preview the welcome, goodbye, or DM greeting card.",
  guildOnly: true,
  requiredPermit: "admin.welcome",
  prefixEnabled: true,
  build: () => {
    const builder = new SlashCommandBuilder().setName("welcome");
    return (
    builder
            .setName("welcome")
            .setDescription("Preview the welcome, goodbye, or DM greeting card.")
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
            )
    ) as SlashCommandBuilder;
  },
  run: async (ctx: CommandContext) => {
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
        ? renderGoodbyeCard(config, vars)
        : kind === "dm"
          ? buildDmWelcomeCard(
              guild.name,
              renderWelcomeTemplate(config.dmWelcomeTemplate, vars),
            )
          : renderWelcomeCard(config, vars);

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
};
