import { ApplyOptions } from "@sapphire/decorators";
import type { ApplicationCommandRegistry } from "@sapphire/framework";
import { ComponentType } from "discord.js";
import { BaseCommand, type CommandContext } from "#lib/commands.js";
import { getUtility } from "#lib/module-system/Utility.js";
import {
  buildPanicAlreadyActiveCard,
  buildPanicCancelledCard,
  buildPanicConfirmCard,
  buildPanicStatusCard,
  PANIC_CONFIRM_ID,
} from "../lib/panic-card.js";

@ApplyOptions<BaseCommand.Options>({
  name: "panic",
  description: "Lock down the server: pause invites and mute @everyone in text channels.",
  preconditions: ["GuildOnly"],
  requiredPermit: "admin.*",
})
export class PanicCommand extends BaseCommand {
  public override registerApplicationCommands(
    registry: ApplicationCommandRegistry,
  ) {
    registry.registerChatInputCommand((b) =>
      b.setName(this.name).setDescription(this.description),
    );
  }

  public override async run(ctx: CommandContext) {
    await ctx.defer();
    const t = await ctx.fetchT();
    const guild = ctx.guild!;

    const existing = await this.container.db.security.getPanicState(guild.id);
    if (existing) {
      return ctx.reply(
        buildPanicAlreadyActiveCard(t, existing.startedAt),
      );
    }

    await ctx.reply(buildPanicConfirmCard(t));
    const interaction = ctx.interaction;
    let confirmed: boolean;
    try {
      const reply = await interaction.fetchReply();
      const click = await reply.awaitMessageComponent({
        filter: (i) => i.user.id === ctx.user.id,
        componentType: ComponentType.Button,
        time: 20_000,
      });
      confirmed = click.customId === PANIC_CONFIRM_ID;
      await click.deferUpdate();
    } catch {
      confirmed = false;
    }

    if (!confirmed) {
      return ctx.reply(buildPanicCancelledCard(t));
    }

    const raw = await this.container.db.config.getAllModuleConfig(
      guild.id,
      "security",
    );
    const channelIds =
      typeof raw["panic_lock_channel_ids"] === "string"
        ? raw["panic_lock_channel_ids"]
            .split(",")
            .map((id) => id.trim())
            .filter((id) => id.length > 0)
        : [];

    const result = await getUtility("security").enterPanic(
      guild,
      ctx.user.id,
      channelIds,
    );

    return ctx.reply(buildPanicStatusCard(t, result));
  }
}
