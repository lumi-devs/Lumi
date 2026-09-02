import { ApplyOptions } from "@sapphire/decorators";
import { ApplicationCommandRegistry } from "@sapphire/framework";
import { AttachmentBuilder } from "discord.js";
import { BaseSubcommand, CommandContext } from "#lib/commands.js";
import {
  makeSuccessCard,
  makeListCard,
  ephemeralCard,
} from "#lib/utilities/cards.js";
import { Emojis } from "#lib/utilities/assets.js";
import { confirmPrompt } from "#lib/utilities/confirm.js";
import { executeGdprDeletion, executeGdprExport } from "#lib/gdpr.js";
import { container } from "@sapphire/framework";
import { getUtility } from "#lib/module-system/Utility.js";
import type { DownloaderUtility } from "#utilities/DownloaderUtility.js";

@ApplyOptions<BaseSubcommand.Options>({
  name: "mydata",
  description:
    "View and manage end-user data, privacy disclosures, and GDPR actions",
  prefixEnabled: true,
  subcommands: [
    { name: "whatdata", run: "whatData", default: true },
    { name: "3rdparty", run: "thirdParty" },
    { name: "getmydata", run: "getMyData" },
    { name: "forgetme", run: "forgetMe" },
  ],
})
export class MyDataCommand extends BaseSubcommand {
  public override registerApplicationCommands(
    registry: ApplicationCommandRegistry,
  ) {
    registry.registerChatInputCommand((b) =>
      b
        .setName(this.name)
        .setDescription(this.description)
        .addSubcommand((s) =>
          s
            .setName("whatdata")
            .setDescription(
              "Learn about end-user data collection, privacy, and GDPR rights",
            ),
        )
        .addSubcommand((s) =>
          s
            .setName("3rdparty")
            .setDescription(
              "View privacy & data statements for installed 3rd-party addons",
            ),
        )
        .addSubcommand((s) =>
          s
            .setName("getmydata")
            .setDescription("Export a complete copy of all your stored data"),
        )
        .addSubcommand((s) =>
          s
            .setName("forgetme")
            .setDescription(
              "Have Lumi delete and anonymize all data stored about you",
            ),
        ),
    );
  }

  private get downloaderService(): DownloaderUtility {
    return getUtility("downloader");
  }

  public async whatData(ctx: CommandContext) {
    await ctx.replyInfo(
      `${Emojis.SHIELD} End-User Data & Privacy in Lumi`,
      [
        "Lumi respects user privacy and complies with GDPR and CCPA data rights:",
        "",
        "• **Data Collection**: Lumi only stores data required for features you use (e.g. AFK status, moderation history, temporary voice channels, and server permissions).",
        "• **Right of Access (`/mydata getmydata`)**: You can request an export of all data associated with your user ID across the bot.",
        "• **Right to Erasure (`/mydata forgetme`)**: You can request permanent deletion and anonymization of your stored data.",
        "• **3rd-Party Addons (`/mydata 3rdparty`)**: You can inspect privacy statements provided by installed community addons.",
      ].join("\n"),
    );
  }

  public async thirdParty(ctx: CommandContext) {
    const installed = await this.downloaderService.getInstalledModules();

    if (installed.length === 0) {
      await ctx.replyInfo(
        "Third-Party Addons",
        "This bot instance does not have any third-party addons installed.",
      );
      return;
    }

    const lines = installed.map((mod) => {
      const record = container.moduleStore.getRecord(mod.moduleName);
      const title = `${record?.meta?.emoji ?? "📦"} **${record?.meta?.displayName ?? mod.moduleName}**`;
      const statement = record?.meta?.endUserDataStatement;
      return statement
        ? `${title}\n🛡️ **Privacy Statement**: ${statement}`
        : `${title}\n⚠️ *No end-user data statement provided by author.*`;
    });

    const card = makeListCard("3rd-Party Addon Privacy Statements", lines);
    await ctx.reply(card);
  }

  public async getMyData(ctx: CommandContext) {
    const userId = ctx.user.id;
    const exportData = await executeGdprExport(userId);

    const buffer = Buffer.from(JSON.stringify(exportData, null, 2), "utf-8");
    const attachment = new AttachmentBuilder(buffer, {
      name: `lumi-user-data-${userId}.json`,
      description: "Lumi GDPR User Data Export",
    });

    const card = makeSuccessCard(
      "Data Export Ready",
      "Attached is your complete structured data export in JSON format.",
    );

    if (ctx.isSlash) {
      if (ctx.interaction.deferred || ctx.interaction.replied) {
        await ctx.interaction.editReply({
          ...ephemeralCard(card),
          files: [attachment],
        });
      } else {
        await ctx.interaction.reply({
          ...ephemeralCard(card),
          files: [attachment],
        });
      }
    } else {
      await ctx.message.reply({
        ...card,
        files: [attachment],
      });
    }
  }

  public async forgetMe(ctx: CommandContext) {
    const userId = ctx.user.id;

    const { confirmed } = await confirmPrompt(ctx, {
      title: `${Emojis.WARNING_SIGN} Request Data Deletion`,
      body: [
        "Are you sure you want to delete and anonymize all your stored data in Lumi?",
        "",
        "This will permanently delete your AFK settings, owned voice channels, and permission assignments, and anonymize your identity in historical moderation records.",
        "",
        "**This action is permanent and cannot be undone.**",
      ].join("\n"),
      confirmLabel: "Yes, delete my data",
    });

    if (!confirmed) {
      await ctx.replyInfo("Cancelled", "Data deletion request was cancelled.");
      return;
    }

    const result = await executeGdprDeletion(userId, ctx.user.tag);

    if (result.failedModules.length > 0) {
      await ctx.replyInfo(
        "Partial Deletion",
        `Your core data was deleted, but the following modules failed to scrub data: \`${result.failedModules.join(", ")}\`. Please contact a bot administrator.`,
      );
    } else {
      await ctx.replySuccess(
        "Data Deleted",
        "All your stored data has been permanently scrubbed and anonymized.",
      );
    }
  }
}
