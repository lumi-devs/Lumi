import { SlashCommandBuilder } from "discord.js";
import type { CommandDef } from "#src/lib/commands/CommandDef.js";
import type { CommandContext } from "#src/lib/commands/Context.js";
import { lockAllTextChannels, unlockAllTextChannels } from "#src/lib/discord/ChannelLocks.js";
import { confirmPrompt } from "#src/lib/utilities/Confirm.js";
import { makeErrorCard } from "#src/lib/ui/Cards.js";

export const lockdownDef: CommandDef = {
  name: "lockdown",
  description: "Enable or disable server lockdown",
  guildOnly: true,
  requiredPermit: "mod.lockdown",
  build: () =>
    new SlashCommandBuilder()
      .setName("lockdown")
      .setDescription("Enable or disable server lockdown")
            .addSubcommand((s) =>
              s.setName("enable").setDescription("Lock down all text channels"),
            )
            .addSubcommand((s) =>
              s
                .setName("disable")
                .setDescription("Remove lockdown from text channels"),
            ),
  handlers: {
  "enable": async (ctx: CommandContext) => {
    const { confirmed, message } = await confirmPrompt(ctx, {
      title: "Confirm Lockdown",
      body: "You're about to disable **SendMessages** for @everyone in every text channel of this server. Members will not be able to chat until lockdown is disabled.",
      confirmLabel: "I understand, lock it down",
    });
    if (!confirmed) {
      await message.edit({
        ...makeErrorCard("Cancelled", "Lockdown was not enabled."),
      });
      return;
    }

    await ctx.defer();
    const { modified, failed } = await lockAllTextChannels(ctx.guild!);

    if (modified === 0 && failed > 0) {
      return ctx.replyError(
        "Lockdown Failed",
        `Could not modify permissions for ${failed} channels.`,
      );
    }

    return ctx.replySuccess(
      "Lockdown Enabled",
      `Successfully disabled SendMessages for @everyone in ${modified} text channel(s).`
    );
  },
  "disable": async (ctx: CommandContext) => {
    await ctx.defer();
    const { modified, failed } = await unlockAllTextChannels(ctx.guild!);

    if (modified === 0 && failed > 0) {
      return ctx.replyError(
        "Lockdown Disable Failed",
        `Could not modify permissions for ${failed} channels.`,
      );
    }

    return ctx.replySuccess(
      "Lockdown Disabled",
      `Successfully restored SendMessages for @everyone in ${modified} text channel(s).`,
    );
  }
  }
};
