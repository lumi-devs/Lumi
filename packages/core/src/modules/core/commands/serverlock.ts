import { SlashCommandBuilder } from "discord.js";
import type { CommandDef } from "@lumi/lib/commands/command-def.js";
import { CommandContext } from "@lumi/lib/commands/context.js";
import {
  getServerLockState,
  setServerLockState,
} from "../services/server-lock.js";

export const serverlockDef: CommandDef = {
  name: "serverlock",
  description: "Lock the bot to its current servers (Bot Owner Only)",
  botOwner: true,
  prefixEnabled: true,
  build: () => {
    const b = new SlashCommandBuilder().setName("serverlock");
    return (
    b
            .setName("serverlock")
            .setDescription("Lock the bot to its current servers (Bot Owner Only)")
            .addSubcommand((s) =>
              s.setName("on").setDescription("Lock the bot to its current servers"),
            )
            .addSubcommand((s) =>
              s.setName("off").setDescription("Unlock the bot so it can join new servers"),
            )
            .addSubcommand((s) =>
              s.setName("status").setDescription("Show whether server lock is enabled"),
            )
    );
  },
  handlers: {
  "on": async (ctx: CommandContext) => {
    const state = await getServerLockState(ctx.services.db);
    if (state.enabled) {
      await ctx.replyInfo(
        `🔒 Server Lock Already On`,
        `The bot is already locked to **${state.guildIds.length}** server(s). New servers are left on join.`,
      );
      return;
    }
    const guildIds = [...ctx.services.client.guilds.cache.keys()];
    await setServerLockState(ctx.services.db, { enabled: true, guildIds });
    ctx.services.logger.info(
      `[ServerLock] 🔒 Enabled by ${ctx.user.tag} (${guildIds.length} guilds snapshotted)`,
    );
    await ctx.replySuccess(
      `🔒 Server Lock Enabled`,
      `Locked to the current **${guildIds.length}** server(s). The bot will now leave any newly joined server.`
    );
  },
  "off": async (ctx: CommandContext) => {
    const state = await getServerLockState(ctx.services.db);
    if (!state.enabled) {
      await ctx.replyInfo(
        `🔓 Server Lock Already Off`,
        "The bot is not locked and may stay in newly joined servers.",
      );
      return;
    }
    await setServerLockState(ctx.services.db, { enabled: false, guildIds: [] });
    ctx.services.logger.info(
      `[ServerLock] 🔓 Disabled by ${ctx.user.tag}`,
    );
    await ctx.replySuccess(
      `🔓 Server Lock Disabled`,
      "The bot will now stay in newly joined servers."
    );
  },
  "status": async (ctx: CommandContext) => {
    const state = await getServerLockState(ctx.services.db);
    if (!state.enabled) {
      await ctx.replyInfo(
        `🔓 Server Lock Off`,
        "The bot will stay in newly joined servers.",
      );
      return;
    }
    await ctx.replyInfo(
      `🔒 Server Lock On`,
      `Locked to **${state.guildIds.length}** server(s). The bot leaves any newly joined server.`,
    );
  }
  },
  defaultSub: "status"
};
