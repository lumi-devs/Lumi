import { ApplyOptions } from "@sapphire/decorators";
import { BucketScope, Command } from "@sapphire/framework";
import { type ChatInputCommandInteraction, type Message } from "discord.js";
import { BaseCommand } from "#lib/commands.js";
import { collectPingData } from "#core/lib/ping-collect.js";
import {
  buildOverviewCard,
  PING_FLAGS,
  EPHEMERAL_FLAGS,
} from "#core/lib/ping-cards.js";

const LIVE_UPDATES_DURATION = 60_000;
const LIVE_UPDATE_INTERVAL = 10_000;
/** Per-user live-update interval handles; ensures at most one active interval per user. */
const activeIntervals = new Map<string, ReturnType<typeof setInterval>>();

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
      builder //
        .setName(this.name)
        .setDescription(this.description),
    );
  }

  public override async chatInputRun(interaction: ChatInputCommandInteraction) {
    const data = await collectPingData();

    const response = await interaction.reply({
      flags: EPHEMERAL_FLAGS,
      components: [
        buildOverviewCard({ roundTrip: null, ...data }, interaction.user.id),
      ],
      allowedMentions: {},
      withResponse: true,
    });

    const msg = response.resource!.message!;
    const roundTrip = msg.createdTimestamp - interaction.createdTimestamp;

    await interaction.editReply({
      flags: EPHEMERAL_FLAGS,
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
    // Cancel any existing live-update loop for this user before starting a new one.
    const existing = activeIntervals.get(userId);
    if (existing) clearInterval(existing);

    const start = Date.now();
    const interval = setInterval(async () => {
      if (Date.now() - start >= LIVE_UPDATES_DURATION) {
        clearInterval(interval);
        activeIntervals.delete(userId);
        return;
      }

      try {
        const data = await collectPingData();
        await msg
          .edit({
            flags: PING_FLAGS,
            components: [
              buildOverviewCard({ roundTrip: null, ...data }, userId),
            ],
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
