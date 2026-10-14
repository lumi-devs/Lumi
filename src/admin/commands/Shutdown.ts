import { SlashCommandBuilder } from "discord.js";
import type { CommandDef } from "#src/lib/commands/CommandDef.js";
import { destroyLumi } from "#src/lib/client/LumiClient.js";
import { container } from "#src/lib/Services.js";
import { scheduleProcessRestart } from "#src/lib/Restart.js";

export const shutdownDef: CommandDef = {
  name: "shutdown",
  description: "Gracefully shut the bot down.",
  botOwner: true,
  build: () =>
    new SlashCommandBuilder()
      .setName("shutdown")
      .setDescription("Gracefully shut the bot down."),
  run: async (ctx) => {
    await ctx.replyWarning("Shutting down…", "Draining jobs and disconnecting.");
    await destroyLumi(ctx.services.client, container).catch(() => undefined);
    process.exit(0);
  },
};

export const restartDef: CommandDef = {
  name: "restart",
  description: "Gracefully restart the bot (exit 26 for the supervisor).",
  botOwner: true,
  build: () =>
    new SlashCommandBuilder()
      .setName("restart")
      .setDescription("Gracefully restart the bot."),
  run: async (ctx) => {
    await ctx.replyWarning("Restarting…", "Draining jobs, the supervisor will bring me back.");
    scheduleProcessRestart(ctx.services, "owner /restart command");
  },
};
