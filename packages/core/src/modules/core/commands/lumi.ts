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
    const t = await ctx.fetchT();
    await ctx.reply(
      makeInfoCard(
        t("core:updatingCoreTitle"),
        `${Emojis.LOADING} ${t("core:updatingCoreText")}`,
      ),
    );

    const res = await updateLumiCore();
    if (res.error) {
      await ctx.reply(
        makeErrorCard(`${Emojis.ERROR} ${t("core:coreUpdateFailedTitle")}`, res.error),
      );
      return;
    }

    if (res.updated) {
      const body = t("core:coreUpdatedText", {
        commitsCount: res.commitsCount,
        latestCommit: res.latestCommit,
        currentCommit: res.currentCommit,
        changelog: res.changelog,
      });
      await ctx.reply(
        makeSuccessCard(`${Emojis.BOT} ${t("core:coreUpdatedTitle")}`, body, {
          actionRows: [restartChoiceRow(ctx.user.id)],
        }),
      );
      return;
    }

    await ctx.reply(
      makeSuccessCard(
        `${Emojis.BOT} ${t("core:coreUpToDateTitle")}`,
        t("core:coreUpToDateText", { currentCommit: res.currentCommit }),
      ),
    );
  }
}
