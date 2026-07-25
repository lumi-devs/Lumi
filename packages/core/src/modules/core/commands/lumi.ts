import { ApplyOptions } from "@sapphire/decorators";
import { ApplicationCommandRegistry, container } from "@sapphire/framework";
import { BaseSubcommand, CommandContext } from "#lib/commands.js";
import { PermissionLevel } from "#lib/permissions/index.js";
import {
  makeSuccessCard,
  makeErrorCard,
  makeInfoCard,
} from "#lib/utilities/cards.js";
import { Emojis } from "#lib/utilities/assets.js";
import { buildHubView } from "#modules/core/lib/hub-panel.js";
import { loadFeatures } from "#modules/core/lib/config-panel.js";
import { updateLumiCore } from "#lib/utilities/self-update.js";
import { restartChoiceRow } from "#lib/restart.js";

@ApplyOptions<BaseSubcommand.Options>({
  name: "lumi",
  description: "Open the Lumi control panel or update Lumi core",
  preconditions: ["GuildOnly"],
  permissionLevel: PermissionLevel.ADMIN,
  prefixEnabled: true,
  subcommands: [
    { name: "update", run: "update" },
    { name: "panel", run: "panel", default: true },
  ],
})
export class LumiCommand extends BaseSubcommand {
  public override registerApplicationCommands(
    registry: ApplicationCommandRegistry,
  ) {
    registry.registerChatInputCommand((b) =>
      b
        .setName(this.name)
        .setDescription(this.description)
        .addSubcommand((s) =>
          s
            .setName("panel")
            .setDescription("Open the Lumi control panel"),
        )
        .addSubcommand((s) =>
          s
            .setName("update")
            .setDescription("Update Lumi core to the latest version"),
        ),
    );
  }

  public async panel(ctx: CommandContext): Promise<void> {
    const guildId = ctx.guildId!;
    const [features, settings] = await Promise.all([
      loadFeatures(guildId),
      container.db.config.getGuildSettings(guildId),
    ]);
    await ctx.reply(
      buildHubView({
        moduleCount: features.length,
        enabledCount: features.filter((f) => f.guildEnabled).length,
        prefix: settings.prefix,
        locale: settings.locale,
      }),
    );
  }

  public async update(ctx: CommandContext): Promise<void> {
    await ctx.checkPermission(PermissionLevel.BOT_OWNER);
    await ctx.reply(
      makeInfoCard(
        "Updating Lumi Core",
        `${Emojis.LOADING} Checking and pulling latest Lumi core codebase...`,
      ),
    );

    const res = await updateLumiCore();
    if (res.error) {
      await ctx.reply(
        makeErrorCard(`${Emojis.ERROR} Core Update Failed`, res.error),
      );
      return;
    }

    if (res.updated) {
      const body = `Successfully updated Lumi core codebase! (**${res.commitsCount}** new commit(s) pulled).\n\n**New Commit:** \`${res.latestCommit}\` (from \`${res.currentCommit}\`)\n\n**Changelog:**\n\`\`\`\n${res.changelog}\n\`\`\``;
      await ctx.reply(
        makeSuccessCard(`${Emojis.BOT} Lumi Core Updated`, body, {
          actionRows: [restartChoiceRow(ctx.user.id)],
        }),
      );
      return;
    }

    await ctx.reply(
      makeSuccessCard(
        `${Emojis.BOT} Lumi Core Up to Date`,
        `Lumi core is already running the latest commit (\`${res.currentCommit}\`).`,
      ),
    );
  }
}
