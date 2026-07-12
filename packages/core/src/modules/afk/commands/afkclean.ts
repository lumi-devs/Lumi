import { ApplyOptions } from "@sapphire/decorators";
import { getService } from "#lib/module-system/Service.js";
import { type ApplicationCommandRegistry } from "@sapphire/framework";
import { BaseCommand, type CommandContext } from "#lib/commands.js";
import { PermissionLevel } from "#lib/permissions/index.js";
import type AfkService from "../services/AfkService.js";

@ApplyOptions<BaseCommand.Options>({
  name: "afkclean",
  description:
    "Remove AFK entries whose users are no longer cached (owner only).",
  permissionLevel: PermissionLevel.BOT_OWNER,
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
    await ctx.defer();
    const removed = await this.afkService.cleanStaleEntries();
    return ctx.replySuccess(
      "AFK Cleanup",
      `Removed ${removed} stale AFK entries.`,
    );
  }
}
