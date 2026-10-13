import { Time } from "#src/shared/Index.ts";
import type { Container } from "#src/lib/Services.js";
import { SlashCommandBuilder, type Message } from "discord.js";
import type { CommandDef } from "#src/lib/commands/CommandDef.js";
import { collectPingData } from "#src/modules/onboarding/services/PingCollect.js";
import {
  buildOverviewCard,
  PingFlags,
  EphemeralFlags,
} from "#src/modules/onboarding/ui/PingCards.js";

const LiveUpdatesDuration = Time.Minute;
const LiveUpdateInterval = Time.Second * 10;

const activeIntervals = new Map<string, ReturnType<typeof setInterval>>();
export const pingViewStates = new Map<
  string,
  import("#src/modules/onboarding/ui/PingCards.js").PingCategory | "overview"
>();

function stopLiveUpdates(userId: string, interval?: ReturnType<typeof setInterval>) {
  clearInterval(interval ?? activeIntervals.get(userId));
  activeIntervals.delete(userId);
  pingViewStates.delete(userId);
}

function startLiveUpdates(services: Container, userId: string, msg: Message) {
  stopLiveUpdates(userId);

  pingViewStates.set(userId, "overview");

  const start = Date.now();
  const interval = setInterval(async () => {
    if (Date.now() - start >= LiveUpdatesDuration) {
      stopLiveUpdates(userId, interval);
      return;
    }

    try {
      const data = await collectPingData(services);
      const state = pingViewStates.get(userId) || "overview";
      const { buildDetailCard } =
        await import("#src/modules/onboarding/ui/PingCards.js");
      const card =
        state === "overview"
          ? buildOverviewCard({ roundTrip: null, ...data }, userId)
          : buildDetailCard(state, { roundTrip: null, ...data }, userId);

      await msg
        .edit({
          flags: PingFlags,
          components: [card],
          allowedMentions: {},
        })
        .catch(() => {
          stopLiveUpdates(userId, interval);
        });
    } catch {
      stopLiveUpdates(userId, interval);
    }
  }, LiveUpdateInterval).unref();

  activeIntervals.set(userId, interval);
}

export const pingDef: CommandDef = {
  name: "ping",
  aliases: ["pong", "latency"],
  description: "Check the bot status, latency, and system health.",
  cooldownMs: 10_000,
  build: () =>
    new SlashCommandBuilder()
      .setName("ping")
      .setDescription("Check the bot status, latency, and system health."),
  run: async (ctx) => {
    if (ctx.isSlash) {
      const interaction = ctx.interaction;
      const data = await collectPingData(ctx.services);

      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ flags: EphemeralFlags });
      }

      const card = buildOverviewCard({ roundTrip: null, ...data }, interaction.user.id);
      const msg = await interaction.editReply({
        flags: PingFlags,
        components: [card],
        allowedMentions: {},
      });

      const roundTrip = msg.createdTimestamp - interaction.createdTimestamp;

      await interaction.editReply({
        flags: PingFlags,
        components: [
          buildOverviewCard({ roundTrip, ...data }, interaction.user.id),
        ],
        allowedMentions: {},
      });
      return;
    }

    const message = ctx.message;
    if (!message.channel.isSendable()) return;

    const data = await collectPingData(ctx.services);

    let msg = await message.reply({
      flags: PingFlags,
      components: [
        buildOverviewCard({ roundTrip: null, ...data }, message.author.id),
      ],
      allowedMentions: {},
    });

    const roundTrip = msg.createdTimestamp - message.createdTimestamp;

    msg = await msg.edit({
      flags: PingFlags,
      components: [
        buildOverviewCard({ roundTrip, ...data }, message.author.id),
      ],
      allowedMentions: {},
    });

    void startLiveUpdates(ctx.services, message.author.id, msg);
  },
  onUnload: () => {
    for (const interval of activeIntervals.values()) {
      clearInterval(interval);
    }
    activeIntervals.clear();
    pingViewStates.clear();
  },
};
