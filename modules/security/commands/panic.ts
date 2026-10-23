import { SlashCommandBuilder } from "discord.js";
import type { CommandDef } from "@lumi/module-kit";
import { confirmPrompt } from "@lumi/module-kit";
import { makeErrorCard } from "@lumi/ui";
import { enterPanic } from "../services/panic.ts";
import { buildPanicActiveCard, buildPanicAlreadyActiveCard } from "../ui.ts";

export const panicCommand: CommandDef = {
  name: "panic",
  description: "Lock down the server: pause invites and mute @everyone in text channels.",
  module: "security",
  guildOnly: true,
  permitNode: "admin.*",
  build: () =>
    new SlashCommandBuilder()
      .setName("panic")
      .setDescription("Lock down the server: pause invites and mute @everyone in text channels."),
  async run(ctx) {
    const guild = ctx.guild;
    if (!guild) return ctx.reply(makeErrorCard("Server Only", "This command can only be used in a server."));

    const existing = await ctx.services.db.security.getPanicState(guild.id);
    if (existing) {
      return ctx.reply(buildPanicAlreadyActiveCard(existing.startedAt));
    }

    const { confirmed, message } = await confirmPrompt(ctx, {
      title: "Confirm Panic Mode",
      body: "You are about to lock **Send Messages** for @everyone in the configured channels and pause invites. Members will not be able to chat until you revert panic mode.",
      confirmLabel: "I understand, lock it down",
    });

    if (!confirmed) {
      if (message) {
        await message
          .edit({
            components: [
              ...makeErrorCard("Cancelled", "Panic mode was not activated.").components,
            ],
          })
          .catch(() => undefined);
      }
      return;
    }

    await ctx.defer();
    const result = await enterPanic(ctx.services, guild, ctx.user.id);

    if (result.alreadyActive) {
      return ctx.reply(
        buildPanicAlreadyActiveCard(result.startedAt ?? new Date()),
      );
    }

    return ctx.reply(
      buildPanicActiveCard({
        invitesPaused: result.invitesPaused,
        lockedCount: result.lockedCount,
        skippedCount: result.skippedCount,
      }),
    );
  },
};
