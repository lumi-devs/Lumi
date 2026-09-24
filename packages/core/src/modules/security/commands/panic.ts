import { ApplyOptions } from "@sapphire/decorators";
import type { ApplicationCommandRegistry } from "@sapphire/framework";
import { BaseCommand } from "#lib/commands.js";
import type { CommandContext } from "#lib/command-context.js";
import { enterPanic } from "../services/panic.js";
import { toStringArray } from "#lib/module-system/config-schema.js";
import { confirmPrompt } from "#lib/utilities/confirm.js";
import {
  buildPanicAlreadyActiveCard,
  buildPanicCancelledCard,
  buildPanicStatusCard,
} from "../ui/panic-card.js";

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

    const { confirmed } = await confirmPrompt(ctx, {
      title: t("panels:panicConfirmTitle"),
      body: t("panels:panicConfirmBody"),
      confirmLabel: t("panels:panicConfirmButton"),
      time: 20_000,
    });

    if (!confirmed) {
      return ctx.reply(buildPanicCancelledCard(t));
    }

    const raw = await this.container.db.config.getAllModuleConfig(
      guild.id,
      "security",
    );
    const channelIds = toStringArray(raw["panic_lock_channel_ids"]);

    const result = await enterPanic(
      guild,
      ctx.user.id,
      channelIds,
    );

    return ctx.reply(buildPanicStatusCard(t, result));
  }
}
