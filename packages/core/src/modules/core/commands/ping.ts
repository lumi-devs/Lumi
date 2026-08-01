import { ApplyOptions } from "@sapphire/decorators";
import { BucketScope, Command } from "@sapphire/framework";
import { type ChatInputCommandInteraction, type Message } from "discord.js";
import { BaseCommand } from "#lib/commands.js";
import { collectPingData } from "#modules/core/lib/ping-collect.js";
import {
  buildOverviewCard,
  PING_FLAGS,
  EPHEMERAL_FLAGS,
} from "#modules/core/lib/ping-cards.js";

const LIVE_UPDATES_DURATION = 60_000;
const LIVE_UPDATE_INTERVAL = 10_000;
/** Per-user live-update interval handles; ensures at most one active interval per user. */
const activeIntervals = new Map<string, ReturnType<typeof setInterval>>();
export const pingViewStates = new Map<
  string,
  import("#modules/core/lib/ping-cards.js").PingCategory | "overview"
>();

@ApplyOptions<Command.Options>({
  name: "ping",
  aliases: ["pong", "latency"],
  description: "Check the bot status, latency, and system health.",
  cooldownDelay: 10_000,
  cooldownScope: BucketScope.User,
})
export class PingCommand extends BaseCommand {
  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder.setName(this.name).setDescription(this.description),
    );
  }

  public override async chatInputRun(interaction: ChatInputCommandInteraction) {
    const data = await collectPingData();

    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ flags: EPHEMERAL_FLAGS });
    }

    const msg = await interaction.editReply({
      components: [
        buildOverviewCard({ roundTrip: null, ...data }, interaction.user.id),
      ],
      allowedMentions: {},
    });

    const roundTrip = msg.createdTimestamp - interaction.createdTimestamp;

    await interaction.editReply({
      components: [
        buildOverviewCard({ roundTrip, ...data }, interaction.user.id),
      ],
      allowedMentions: {},
    });
  }

  public override async messageRun(message: Message) {
    if (!message.channel.isSendable()) return;

    const data = await collectPingData();

    let msg = await message.reply({
      flags: PING_FLAGS,
      components: [
        buildOverviewCard({ roundTrip: null, ...data }, message.author.id),
      ],
      allowedMentions: {},
    });

    const roundTrip = msg.createdTimestamp - message.createdTimestamp;

    msg = await msg.edit({
      flags: PING_FLAGS,
      components: [
        buildOverviewCard({ roundTrip, ...data }, message.author.id),
      ],
      allowedMentions: {},
    });

    void this.#startLiveUpdates(message.author.id, msg);
  }

  #startLiveUpdates(userId: string, msg: Message) {
    const existing = activeIntervals.get(userId);
    if (existing) clearInterval(existing);

    pingViewStates.set(userId, "overview");

    const start = Date.now();
    const interval = setInterval(async () => {
      if (Date.now() - start >= LIVE_UPDATES_DURATION) {
        clearInterval(interval);
        activeIntervals.delete(userId);
        return;
      }

      try {
        const data = await collectPingData();
        const state = pingViewStates.get(userId) || "overview";
        const { buildDetailCard } =
          await import("#modules/core/lib/ping-cards.js");
        const card =
          state === "overview"
            ? buildOverviewCard({ roundTrip: null, ...data }, userId)
            : buildDetailCard(state, { roundTrip: null, ...data }, userId);

        await msg
          .edit({
            flags: PING_FLAGS,
            components: [card],
            allowedMentions: {},
          })
          .catch(() => {
            clearInterval(interval);
            activeIntervals.delete(userId);
          });
      } catch {
        clearInterval(interval);
        activeIntervals.delete(userId);
      }
    }, LIVE_UPDATE_INTERVAL).unref();

    activeIntervals.set(userId, interval);
  }
}
