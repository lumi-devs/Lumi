import { BaseSubcommand, CommandContext } from "#lib/commands.js";
import { Emojis } from "#utilities/assets.js";
import {
  getServerLockState,
  setServerLockState,
} from "#modules/core/lib/server-lock.js";
import { ApplyOptions } from "@sapphire/decorators";
import type { ApplicationCommandRegistry } from "@sapphire/framework";

@ApplyOptions<BaseSubcommand.Options>({
  name: "serverlock",
  description: "Lock the bot to its current servers (Bot Owner Only)",
  preconditions: ["BotOwner"],
  prefixEnabled: true,
  subcommands: [
    { name: "on", run: "enable" },
    { name: "off", run: "disable" },
    { name: "status", run: "status", default: true },
  ],
})
export class ServerLockCommand extends BaseSubcommand {
  public override registerApplicationCommands(
    registry: ApplicationCommandRegistry,
  ) {
    registry.registerChatInputCommand((b) =>
      b
        .setName(this.name)
        .setDescription(this.description)
        .addSubcommand((s) =>
          s.setName("on").setDescription("Lock the bot to its current servers"),
        )
        .addSubcommand((s) =>
          s.setName("off").setDescription("Unlock the bot so it can join new servers"),
        )
        .addSubcommand((s) =>
          s.setName("status").setDescription("Show whether server lock is enabled"),
        ),
    );
  }

  public async enable(ctx: CommandContext): Promise<void> {
    const state = await getServerLockState(this.container.db);
    if (state.enabled) {
      await ctx.replyInfo(
        `${Emojis.Lock} Server Lock Already On`,
        `The bot is already locked to **${state.guildIds.length}** server(s). New servers are left on join.`,
      );
      return;
    }
    const guildIds = [...this.container.client.guilds.cache.keys()];
    await setServerLockState(this.container.db, { enabled: true, guildIds });
    this.container.logger.info(
      `[ServerLock] ${Emojis.Lock} Enabled by ${ctx.user.tag} (${guildIds.length} guilds snapshotted)`,
    );
    await ctx.replySuccess(
      `${Emojis.Lock} Server Lock Enabled`,
      `Locked to the current **${guildIds.length}** server(s). The bot will now leave any newly joined server.`,
    );
  }

  public async disable(ctx: CommandContext): Promise<void> {
    const state = await getServerLockState(this.container.db);
    if (!state.enabled) {
      await ctx.replyInfo(
        `${Emojis.Unlock} Server Lock Already Off`,
        "The bot is not locked and may stay in newly joined servers.",
      );
      return;
    }
    await setServerLockState(this.container.db, { enabled: false, guildIds: [] });
    this.container.logger.info(
      `[ServerLock] ${Emojis.Unlock} Disabled by ${ctx.user.tag}`,
    );
    await ctx.replySuccess(
      `${Emojis.Unlock} Server Lock Disabled`,
      "The bot will now stay in newly joined servers.",
    );
  }

  public async status(ctx: CommandContext): Promise<void> {
    const state = await getServerLockState(this.container.db);
    if (!state.enabled) {
      await ctx.replyInfo(
        `${Emojis.Unlock} Server Lock Off`,
        "The bot will stay in newly joined servers.",
      );
      return;
    }
    await ctx.replyInfo(
      `${Emojis.Lock} Server Lock On`,
      `Locked to **${state.guildIds.length}** server(s). The bot leaves any newly joined server.`,
    );
  }
}
