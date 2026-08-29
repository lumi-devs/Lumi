import { ApplyOptions } from "@sapphire/decorators";
import { container, type Command } from "@sapphire/framework";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { getService } from "lumi";
import { BaseSubcommand, type CommandContext } from "lumi/commands";
import { scheduleTask } from "lumi/scheduling";
import { announceGiveawayEnd } from "../lib/announce.js";
import { getGiveaway } from "../lib/store.js";

@ApplyOptions<BaseSubcommand.Options>({
  name: "giveaway",
  description: "Run a giveaway.",
  requiredPermit: "mod.giveaway",
  subcommands: [
    { name: "start", run: "start" },
    { name: "end", run: "end" },
  ],
})
export default class GiveawayCommand extends BaseSubcommand {
  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName(this.name)
        .setDescription(this.description)
        .addSubcommand((sub) =>
          sub
            .setName("start")
            .setDescription("Start a giveaway.")
            .addStringOption((opt) => opt.setName("prize").setDescription("What's being given away.").setRequired(true))
            .addIntegerOption((opt) =>
              opt
                .setName("minutes")
                .setDescription("How long the giveaway runs.")
                .setMinValue(1)
                .setMaxValue(10_080)
                .setRequired(true),
            )
            .addIntegerOption((opt) =>
              opt.setName("winners").setDescription("Number of winners.").setMinValue(1).setMaxValue(20),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName("end")
            .setDescription("End a giveaway early.")
            .addStringOption((opt) => opt.setName("id").setDescription("Giveaway ID.").setRequired(true)),
        ),
    );
  }

  public async start(ctx: CommandContext) {
    if (!ctx.guildId) return ctx.replyError("Guild Only", "This only works in a server.");

    const prize = (await ctx.getString("prize", { required: true }))!;
    const minutes = (await ctx.getInteger("minutes", { required: true }))!;
    const defaultWinnersRaw = await container.db.config.getModuleConfig(
      ctx.guildId,
      "giveaway",
      "default_winner_count",
    );
    const defaultWinners = typeof defaultWinnersRaw === "number" ? defaultWinnersRaw : 1;
    const winnerCount = (await ctx.getInteger("winners")) ?? defaultWinners;

    const channel = ctx.interaction.channel;
    if (!channel?.isSendable()) return ctx.replyError("Cannot Post", "I can't send messages in this channel.");

    const durationMs = minutes * 60_000;
    const placeholder = await channel.send({ content: `🎉 **${prize}**\nStarting...` });

    const service = getService("giveaway");
    const { id } = await service.start({
      guildId: ctx.guildId,
      channelId: channel.id,
      messageId: placeholder.id,
      prize,
      winnerCount,
      hostId: ctx.user.id,
      durationMs,
    });

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`giveaway:enter:${id}`).setLabel("🎉 Enter").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`giveaway:editprize:${id}`).setLabel("Edit Prize").setStyle(ButtonStyle.Secondary),
    );

    const endsAtUnix = Math.floor((Date.now() + durationMs) / 1000);
    await placeholder.edit({
      content: `🎉 **${prize}**\nEnds <t:${endsAtUnix}:R> - ${winnerCount} winner${winnerCount === 1 ? "" : "s"}.`,
      components: [row],
    });

    // One-shot delayed task - the actual ending logic lives in the
    // "giveaway-end" fire handler (index.ts), not here.
    await scheduleTask("giveaway-end", { guildId: ctx.guildId, giveawayId: id }, { delay: durationMs });

    return ctx.replySuccess("Giveaway Started", `Posted in ${channel}. ID: \`${id}\``);
  }

  public async end(ctx: CommandContext) {
    if (!ctx.guildId) return ctx.replyError("Guild Only", "This only works in a server.");
    const id = (await ctx.getString("id", { required: true }))!;

    const record = await getGiveaway(ctx.guildId, id);
    if (!record) return ctx.replyError("Not Found", "No giveaway with that ID.");
    if (record.endedAt) return ctx.replyWarning("Already Ended", "That giveaway already ended.");

    // Shares the exact same code path the scheduled task uses, so a manual
    // early end and a scheduled end can never disagree about what "ended"
    // means or double-announce winners.
    await announceGiveawayEnd(ctx.guildId, id);
    return ctx.replySuccess("Giveaway Ended", "Winners have been announced.");
  }
}
