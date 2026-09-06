import { BaseCommand, CommandContext } from "#lib/commands.js";
import { Emojis } from "#utilities/assets.js";
import {
  fitLines,
  makeInfoCard,
  makeSuccessCard,
  makeWarningCard,
  type CardReply,
} from "#lib/utilities/cards.js";
import {
  resolveAnnounceChannel,
  runGlobalAnnounce,
  type AnnounceSummary,
} from "#modules/core/lib/global-announce.js";
import { ApplyOptions } from "@sapphire/decorators";
import type { ApplicationCommandRegistry } from "@sapphire/framework";

const AnnounceChannelConfigKey = "announce_channel_id";
const MaxFailedGuildsShown = 10;

function buildAnnounceReportCard(summary: AnnounceSummary): CardReply {
  const lines = [
    `${Emojis.Check} Sent: **${summary.sent}**`,
    `${Emojis.Cross} Failed: **${summary.failed}**`,
    `Skipped (no writable channel): **${summary.skipped}**`,
  ];
  const failedIds = summary.results
    .filter((result) => result.outcome === "failed")
    .slice(0, MaxFailedGuildsShown)
    .map((result) => `\`${result.guildId}\``);
  if (failedIds.length > 0) {
    lines.push("", fitLines(failedIds));
  }
  const body = lines.join("\n");
  return summary.failed > 0
    ? makeWarningCard("Announcement Finished With Failures", body)
    : makeSuccessCard("Announcement Sent", body);
}

@ApplyOptions<BaseCommand.Options>({
  name: "announce",
  description: "Broadcast a message to every server (Bot Owner Only)",
  preconditions: ["BotOwner"],
  prefixEnabled: true,
})
export class AnnounceCommand extends BaseCommand {
  public override registerApplicationCommands(
    registry: ApplicationCommandRegistry,
  ) {
    registry.registerChatInputCommand((b) =>
      b
        .setName(this.name)
        .setDescription(this.description)
        .addStringOption((o) =>
          o
            .setName("message")
            .setDescription("Announcement text sent to every server")
            .setRequired(true)
            .setMaxLength(2000),
        ),
    );
  }

  public override async run(ctx: CommandContext): Promise<void> {
    await ctx.defer();
    const message = (await ctx.getString("message", { required: true, rest: true }))!;
    if (message.trim().length === 0) {
      await ctx.replyError(
        `${Emojis.Cross} Empty Announcement`,
        "Provide the message text to broadcast.",
      );
      return;
    }

    const guilds = [...this.container.client.guilds.cache.values()];
    if (guilds.length === 0) {
      await ctx.replyError(
        `${Emojis.Cross} No Servers`,
        "The bot is not in any server.",
      );
      return;
    }

    await ctx.replyInfo(
      `${Emojis.Bell} Broadcasting`,
      `Sending to **${guilds.length}** server(s).`,
    );

    const card = makeInfoCard(`${Emojis.Bell} Announcement`, message.trim());
    const summary = await runGlobalAnnounce(guilds, async (guild) => {
      let configured: string | null = null;
      try {
        const stored = await this.container.db.config.getModuleConfig(
          guild.id,
          "core",
          AnnounceChannelConfigKey,
        );
        configured = typeof stored === "string" ? stored : null;
      } catch {
        configured = null;
      }
      const channel = resolveAnnounceChannel(guild, configured);
      if (!channel) return "skipped";
      try {
        await channel.send(card);
        return "sent";
      } catch {
        return "failed";
      }
    });

    this.container.logger.info(
      `[Announce] ${Emojis.Bell} Broadcast by ${ctx.user.tag}: ${summary.sent} sent, ${summary.failed} failed, ${summary.skipped} skipped`,
    );
    await ctx.reply(buildAnnounceReportCard(summary));
  }
}
