import { SlashCommandBuilder } from "discord.js";
import type { CommandDef } from "@lumi/module-kit";
import { confirmPrompt } from "@lumi/module-kit";
import { makeErrorCard, makeSuccessCard } from "@lumi/ui";
import { lockAllTextChannels, unlockAllTextChannels } from "../services/lockdown.ts";

export const lockdownCommand: CommandDef = {
  name: "lockdown",
  description: "Enable or disable server lockdown.",
  module: "mod",
  guildOnly: true,
  prefix: true,
  permitNode: ["mod.lockdown", "mod.lock"],
  build: () =>
    new SlashCommandBuilder()
      .setName("lockdown")
      .setDescription("Enable or disable server lockdown.")
      .addSubcommand((sub) =>
        sub.setName("enable").setDescription("Lock down all text channels"),
      )
      .addSubcommand((sub) =>
        sub.setName("disable").setDescription("Remove lockdown from text channels"),
      ),
  async run(ctx) {
    const guild = ctx.guild;
    if (!guild) return ctx.reply(makeErrorCard("Server Only", "This command can only be used in a server."));

    const action = ctx.getSubcommand();
    if (action !== "enable" && action !== "disable") {
      return ctx.reply(
        makeErrorCard("Usage", "Use `/lockdown enable` or `/lockdown disable`."),
      );
    }

    if (action === "enable") {
      const { confirmed, message } = await confirmPrompt(ctx, {
        title: "Confirm Lockdown",
        body: "You're about to disable **Send Messages** for @everyone in every text channel. Members will not be able to chat until lockdown is disabled.",
        confirmLabel: "I understand, lock it down",
      });

      if (!confirmed) {
        if (message) {
          await message
            .edit({ components: [...makeErrorCard("Cancelled", "Lockdown was not enabled.").components] })
            .catch(() => undefined);
        }
        return;
      }

      await ctx.defer();
      const { modified, failed } = await lockAllTextChannels(guild);

      if (modified === 0 && failed > 0) {
        return ctx.reply(
          makeErrorCard("Lockdown Failed", `Could not modify permissions for ${failed} channels.`),
        );
      }

      return ctx.reply(
        makeSuccessCard(
          "Lockdown Enabled",
          `Disabled Send Messages for @everyone in ${modified} text channel(s).${
            failed > 0 ? ` ${failed} channel(s) could not be modified.` : ""
          }`,
        ),
      );
    }

    await ctx.defer();
    const { modified, failed } = await unlockAllTextChannels(guild);

    if (modified === 0 && failed > 0) {
      return ctx.reply(
        makeErrorCard(
          "Lockdown Disable Failed",
          `Could not modify permissions for ${failed} channels.`,
        ),
      );
    }

    return ctx.reply(
      makeSuccessCard(
        "Lockdown Disabled",
        `Restored Send Messages for @everyone in ${modified} text channel(s).${
          failed > 0 ? ` ${failed} channel(s) could not be modified.` : ""
        }`,
      ),
    );
  },
};
