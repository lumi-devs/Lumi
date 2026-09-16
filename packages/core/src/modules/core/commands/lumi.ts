import { BaseSubcommand } from "#lib/commands.js";
import { CommandContext } from "#lib/command-context.js";
import { restartChoiceRow } from "#lib/restart.js";
import { loadFeatures } from "../services/config-panel.js";
import { buildHubView } from "#modules/core/ui/hub.js";
import { Emojis } from "#lib/utilities/assets.js";
import { makeSuccessCard } from "#lib/utilities/cards.js";
import { updateLumiCore } from "#lib/utilities/self-update.js";
import { PermitResolver } from "#lib/permissions/index.js";
import { ApplyOptions } from "@sapphire/decorators";
import {
  ApplicationCommandRegistry,
  container,
  UserError,
} from "@sapphire/framework";

@ApplyOptions<BaseSubcommand.Options>({
  name: "lumi",
  description: "Open the Lumi control panel or update Lumi core",
  preconditions: ["GuildOnly"],
  requiredPermit: "admin.*",
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
          s.setName("panel").setDescription("Open the Lumi control panel"),
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
    const [features, settings, t] = await Promise.all([
      loadFeatures(guildId),
      container.db.config.getGuildSettings(guildId),
      ctx.fetchT(),
    ]);
    const guild = container.client.guilds.cache.get(guildId);
    await ctx.reply(
      buildHubView(
        {
          moduleCount: features.length,
          enabledCount: features.filter((f) => f.guildEnabled).length,
          prefix: settings.prefix,
          locale: settings.locale,
          iconUrl:
            guild?.iconURL() ?? container.client.user?.displayAvatarURL(),
        },
        t,
      ),
    );
  }

  public async update(ctx: CommandContext): Promise<void> {
    // Not `owner.*`: PermitResolver's guild-owner bypass satisfies that node.
    if (!PermitResolver.isBotOwner(ctx.user.id)) {
      throw new UserError({
        identifier: "AccessDenied",
        message: `${Emojis.Cross} Only Bot Owners can update Lumi core.`,
      });
    }
    const t = await ctx.fetchT();
    await ctx.replyInfo(
      t("core:updatingCoreTitle"),
      `${Emojis.Loading} ${t("core:updatingCoreText")}`,
    );

    const res = await updateLumiCore();
    if (res.error) {
      await ctx.replyError(
        `${Emojis.Error} ${t("core:coreUpdateFailedTitle")}`,
        res.error,
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
        makeSuccessCard(`${Emojis.Bot} ${t("core:coreUpdatedTitle")}`, body, {
          actionRows: [restartChoiceRow(ctx.user.id)],
        }),
      );
      return;
    }

    await ctx.replySuccess(
      `${Emojis.Bot} ${t("core:coreUpToDateTitle")}`,
      t("core:coreUpToDateText", { currentCommit: res.currentCommit }),
    );
  }
}
