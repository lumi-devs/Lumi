import { SlashCommandBuilder } from "discord.js";
import type { CommandDef } from "@lumi/bot-kit";

export const ping: CommandDef = {
  name: "ping",
  description: "Check bot, database, and cache latency.",
  module: null,
  prefix: true,
  cooldownMs: 1_000,
  build: () =>
    new SlashCommandBuilder().setName("ping").setDescription("Check bot, database, and cache latency."),
  async run(ctx) {
    const started = performance.now();
    await ctx.defer();
    const [db, redis] = await Promise.all([
      ctx.services.db.ping().catch(() => null),
      ctx.services.redis.ping().then(() => true).catch(() => false),
    ]);
    const total = performance.now() - started;
    const gateway =
      ctx.isSlash && "createdTimestamp" in ctx.source
        ? Math.max(0, Date.now() - ctx.source.createdTimestamp)
        : null;

    const lines = [
      `**Gateway:** ${gateway === null ? "n/a" : `${gateway} ms`}`,
      `**Database:** ${db === null ? "offline" : `${db.toFixed(1)} ms`}`,
      `**Redis:** ${redis ? "ok" : "offline"}`,
      `**Round trip:** ${total.toFixed(1)} ms`,
    ];
    return ctx.replyInfo("🏓 Pong", lines);
  },
};
