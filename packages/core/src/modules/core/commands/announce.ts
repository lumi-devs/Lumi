import { SlashCommandBuilder } from "discord.js";
import type { CommandDef } from "@lumi/lib/commands/command-def.js";
import { CommandContext } from "@lumi/lib/commands/context.js";
import { fitLines, makeInfoCard, makeSuccessCard, makeWarningCard, type CardReply } from "@lumi/lib/ui/cards.js";
import {
  resolveAnnounceChannel,
  runGlobalAnnounce,
  type AnnounceSummary,
} from "../services/global-announce.js";

const AnnounceChannelConfigKey = "announce_channel_id";
const MaxFailedGuildsShown = 10;

function buildAnnounceReportCard(summary: AnnounceSummary): CardReply {
  const lines = [
    `✅ Sent: **${summary.sent}**`,
    `❌ Failed: **${summary.failed}**`,
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

export const announceDef: CommandDef = {
  name: "announce",
  description: "Broadcast a message to every server (Bot Owner Only)",
  botOwner: true,
  prefixEnabled: true,
  build: () => {
    const b = new SlashCommandBuilder().setName("announce");
    return (
    b
            .setName("announce")
            .setDescription("Broadcast a message to every server (Bot Owner Only)")
            .addStringOption((o) =>
              o
                .setName("message")
                .setDescription("Announcement text sent to every server")
                .setRequired(true)
                .setMaxLength(2000),
            )
    ) as SlashCommandBuilder;
  },
  run: async (ctx: CommandContext) => {
    await ctx.defer();
    const message = (await ctx.getString("message", { required: true, rest: true }))!;
    if (message.trim().length === 0) {
      await ctx.replyError(
        `❌ Empty Announcement`,
        "Provide the message text to broadcast.",
      );
      return;
    }

    const guilds = [...ctx.services.client.guilds.cache.values()];
    if (guilds.length === 0) {
      await ctx.replyError(
        `❌ No Servers`,
        "The bot is not in any server.",
      );
      return;
    }

    await ctx.replyInfo(
      `🔔 Broadcasting`,
      `Sending to **${guilds.length}** server(s).`,
    );

    const card = makeInfoCard(`🔔 Announcement`, message.trim());
    const summary = await runGlobalAnnounce(guilds, async (guild) => {
      let configured: string | null = null;
      try {
        const stored = await ctx.services.db.config.getModuleConfig(
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

    ctx.services.logger.info(
      `[Announce] 🔔 Broadcast by ${ctx.user.tag}: ${summary.sent} sent, ${summary.failed} failed, ${summary.skipped} skipped`,
    );
    await ctx.reply(buildAnnounceReportCard(summary));
  }
};
