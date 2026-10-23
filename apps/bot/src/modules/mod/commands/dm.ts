import { SlashCommandBuilder, userMention } from "discord.js";
import type { CommandDef } from "@lumi/bot-kit";
import { makeErrorCard, makeInfoCard, makeSuccessCard } from "@lumi/ui";

const MaxMessageLength = 2_000;

export const dmCommand: CommandDef = {
  name: "dm",
  description: "Relay a direct message through the bot to a user.",
  module: "mod",
  guildOnly: true,
  prefix: true,
  permitNode: "mod.dm",
  build: () =>
    new SlashCommandBuilder()
      .setName("dm")
      .setDescription("Relay a direct message through the bot to a user.")
      .addUserOption((option) =>
        option.setName("user").setDescription("User to message").setRequired(true),
      )
      .addStringOption((option) =>
        option
          .setName("message")
          .setDescription("Message to send")
          .setRequired(true)
          .setMaxLength(MaxMessageLength),
      ),
  async run(ctx) {
    const guild = ctx.guild;
    if (!guild) return ctx.reply(makeErrorCard("Server Only", "This command can only be used in a server."));

    const target = await ctx.getUser("user");
    if (!target) return ctx.reply(makeErrorCard("Missing User", "Please specify a valid user."));

    const message = await ctx.getString("message", { rest: true });
    if (!message) {
      return ctx.reply(makeErrorCard("Missing Message", "Provide the message to send."));
    }

    const sent = await target
      .send(
        makeInfoCard(
          `📨 Message from ${guild.name} staff`,
          `${message}\n\n-# Reply to this message to contact the staff team.`,
        ),
      )
      .catch(() => null);

    if (!sent) {
      return ctx.reply(
        makeErrorCard(
          "Could Not Send",
          `${userMention(target.id)} has DMs closed or has blocked me.`,
        ),
      );
    }

    return ctx.reply(
      makeSuccessCard("Message Sent", `Delivered your message to ${userMention(target.id)}.`),
    );
  },
};
