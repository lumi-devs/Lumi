import { SlashCommandBuilder } from "discord.js";
import type { CommandDef } from "@lumi/bot-kit";
import { makeErrorCard, makeSuccessCard } from "@lumi/ui";
import { getSecurityConfig } from "../services/config.ts";
import { buildVerifyPanel } from "../ui.ts";

export const verifyPanelCommand: CommandDef = {
  name: "verifypanel",
  description: "Post or refresh the verification panel in this channel.",
  module: "security",
  guildOnly: true,
  permitNode: "admin.*",
  build: () =>
    new SlashCommandBuilder()
      .setName("verifypanel")
      .setDescription("Post or refresh the verification panel in this channel."),
  async run(ctx) {
    const guild = ctx.guild;
    const channel = ctx.channel;
    if (!guild) return ctx.reply(makeErrorCard("Server Only", "This command can only be used in a server."));
    if (!channel || !channel.isTextBased() || !channel.isSendable()) {
      return ctx.reply(
        makeErrorCard("Unsupported Channel", "Run this command in a text channel I can post in."),
      );
    }

    const config = await getSecurityConfig(ctx.services, guild.id).catch(() => null);
    if (!config?.verification_enabled || !config.verified_role_id) {
      return ctx.reply(
        makeErrorCard(
          "Verification Not Configured",
          "Enable verification and set a verified role in the Security module settings first.",
        ),
      );
    }

    const card = buildVerifyPanel();

    const existing = await ctx.services.db.security.getVerificationPanel(guild.id);
    if (existing && existing.channelId === channel.id) {
      const message = await channel.messages.fetch(existing.messageId).catch(() => null);
      if (message) {
        await message.edit({ components: [...card.components] });
        await ctx.services.db.security.saveVerificationPanel({
          guildId: guild.id,
          channelId: channel.id,
          messageId: message.id,
        });
        return ctx.reply(
          makeSuccessCard("Verification Panel Updated", `Refreshed the panel in <#${channel.id}>.`),
        );
      }
    }

    const sent = await channel.send(card);
    await ctx.services.db.security.saveVerificationPanel({
      guildId: guild.id,
      channelId: channel.id,
      messageId: sent.id,
    });

    return ctx.reply(
      makeSuccessCard("Verification Panel Posted", `The panel is live in <#${channel.id}>.`),
    );
  },
};
