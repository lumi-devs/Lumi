import { ApplyOptions } from "@sapphire/decorators";
import { getUtility } from "#lib/module-system/Utility.js";
import { type ApplicationCommandRegistry } from "@sapphire/framework";
import { BaseCommand, type CommandContext } from "#lib/commands.js";
import type AfkUtility from "../utilities/AfkUtility.js";

@ApplyOptions<BaseCommand.Options>({
  name: "afkclean",
  description:
    "Remove AFK entries whose users are no longer cached (owner only).",
  preconditions: ["GuildOnly"],
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

  private get afkService(): AfkUtility {
    return getUtility("afk");
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
