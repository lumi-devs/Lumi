import { ApplyOptions } from "@sapphire/decorators";
import { getService } from "#lib/module-system/Service.js";
import { type ApplicationCommandRegistry } from "@sapphire/framework";
import { BaseCommand, type CommandContext } from "#lib/commands.js";
import type AfkService from "../services/AfkService.js";

@ApplyOptions<BaseCommand.Options>({
  name: "afkclean",
  description:
    "Remove AFK entries whose users are no longer cached (owner only).",
  requiredPermit: "owner.*",
  module: "afk",
})
export default class AfkCleanCommand extends BaseCommand {
  public override registerApplicationCommands(
    registry: ApplicationCommandRegistry,
  ) {
    registry.registerChatInputCommand((b) =>
      b.setName(this.name).setDescription(this.description),
    );
  }

  private get afkService(): AfkService {
    return getService("afk");
  }

  public override async run(ctx: CommandContext) {
    const t = await ctx.fetchT();
    await ctx.defer();
    const removed = await this.afkService.cleanStaleEntries();
    return ctx.replySuccess(
      t("afk:cleanTitle"),
      t("afk:cleanSuccess", { count: removed }),
    );
  }
}
