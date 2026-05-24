import { ApplyOptions } from "@sapphire/decorators";
import { Command } from "@sapphire/framework";
import {
  type ChatInputCommandInteraction,
  type Message,
  ApplicationIntegrationType,
} from "discord.js";
import { EmberCommand } from "#lib/commands.js";
import { collectPingData } from "../lib/ping-collect.js";
import { buildOverviewCard, PING_FLAGS } from "../lib/ping-cards.js";

const LIVE_UPDATES_DURATION = 60_000;
const LIVE_UPDATE_INTERVAL = 10_000;

@ApplyOptions<Command.Options>({
  name: "ping",
  aliases: ["pong", "latency"],
  description: "Check the bot status, latency, and system health.",
})
export class PingCommand extends EmberCommand {
  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder //
        .setName(this.name)
        .setDescription(this.description)
        .setDefaultMemberPermissions(this.defaultMemberPermissions ?? null)
        .setContexts(...this.contexts)
        .setIntegrationTypes([ApplicationIntegrationType.GuildInstall]),
    );
  }

  public override async chatInputRun(interaction: ChatInputCommandInteraction) {
    const data = await collectPingData();

    const response = await interaction.reply({
      flags: PING_FLAGS,
      components: [
        buildOverviewCard({ roundTrip: null, ...data }, interaction.user.id),
      ],
      allowedMentions: {},
      withResponse: true,
    });

    const msg = response.resource!.message!;
    const roundTrip = msg.createdTimestamp - interaction.createdTimestamp;

    await interaction.editReply({
      flags: PING_FLAGS,
      components: [
        buildOverviewCard({ roundTrip, ...data }, interaction.user.id),
      ],
      allowedMentions: {},
    });

    void this.#startLiveUpdates(interaction.user.id, msg);
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
    const start = Date.now();
    const interval = setInterval(async () => {
      if (Date.now() - start >= LIVE_UPDATES_DURATION) {
        clearInterval(interval);
        return;
      }

      const data = await collectPingData();
      await msg
        .edit({
          flags: PING_FLAGS,
          components: [buildOverviewCard({ roundTrip: null, ...data }, userId)],
          allowedMentions: {},
        })
        .catch(() => clearInterval(interval));
    }, LIVE_UPDATE_INTERVAL);
  }
}
