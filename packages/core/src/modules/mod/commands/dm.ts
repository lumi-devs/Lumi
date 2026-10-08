import { SlashCommandBuilder } from "discord.js";
import type { CommandDef } from "#lib/commands/command-def.js";
import type { CommandContext } from "#lib/commands/context.js";
import { makeInfoCard } from "#lib/ui/cards.js";

const MaxMessageLength = 2000;

export const dmDef: CommandDef = {
  name: "dm",
  description: "Relay a direct message through the bot to a user",
  guildOnly: true,
  requiredPermit: "mod.dm",
  prefixEnabled: true,
  build: () => {
    const b = new SlashCommandBuilder().setName("dm");
    return (
    b
            .setName("dm")
            .setDescription("Relay a direct message through the bot to a user")
            .addUserOption((o) =>
              o.setName("user").setDescription("User to message").setRequired(true),
            )
            .addStringOption((o) =>
              o
                .setName("message")
                .setDescription("Message to send")
                .setRequired(true)
                .setMaxLength(MaxMessageLength),
            )
    ) as SlashCommandBuilder;
  },
  run: async (ctx: CommandContext) => {
    const target = await ctx.getUser("user", { required: true });
    const message = await ctx.getString("message", {
      required: true,
      rest: true,
    });
    if (!target) return;

    const guildName = ctx.guild?.name ?? "the server";
    const card = makeInfoCard(
      `📨 Message from ${guildName} staff`,
      message!,
    );
    const sent = await target.send(card).catch(() => null);

    if (!sent) {
      return ctx.replyError(
        "Could Not Send",
        `${target} has DMs closed or has blocked the bot.`,
      );
    }
    return ctx.replySuccess("Message Sent", `Sent your message to ${target}.`);
  }
};
