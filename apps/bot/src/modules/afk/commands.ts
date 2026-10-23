import { SlashCommandBuilder, userMention } from "discord.js";
import type { CommandDef } from "@lumi/bot-kit";
import { mapWithConcurrency } from "@lumi/foundation";
import { makeInfoCard, makeListCard } from "@lumi/ui";
import { getAfkConfig } from "./config.ts";
import { afkSince, NickPrefix, sanitizeReason } from "./service.ts";

export const afkCommand: CommandDef = {
  name: "afk",
  description: "Set yourself AFK with an optional reason.",
  module: "afk",
  guildOnly: true,
  prefix: true,
  cooldownMs: 5_000,
  build: () =>
    new SlashCommandBuilder()
      .setName("afk")
      .setDescription("Set yourself AFK")
      .addStringOption((option) =>
        option.setName("reason").setDescription("Why you are away").setMaxLength(100).setRequired(false),
      ),
  async run(ctx) {
    const guildId = ctx.guildId;
    if (!guildId) throw new Error("AFK needs a server.");
    const reason = sanitizeReason((await ctx.getString("reason", { rest: true })) ?? "AFK");
    const existing = await ctx.services.db.afk.findEntry(guildId, ctx.user.id);

    if (existing?.reason === reason) {
      return ctx.replyInfo("💤 Already AFK", `You are AFK: **${reason}**`);
    }

    await ctx.services.db.afk.upsertEntry(guildId, ctx.user.id, reason);

    const config = await getAfkConfig(ctx.services, guildId);
    if (
      config.nick_prefix_enabled &&
      ctx.member &&
      ctx.member.manageable &&
      !ctx.member.displayName.startsWith(NickPrefix)
    ) {
      await ctx.member.setNickname(`${NickPrefix}${ctx.member.displayName}`.slice(0, 32)).catch(() => null);
    }

    return ctx.reply(
      makeInfoCard(
        existing ? "✏️ AFK updated" : "💤 You are AFK",
        `Reason: **${reason}**\nI will tell people who mention you, and clear this when you speak again.`,
      ),
    );
  },
};

export const afkListCommand: CommandDef = {
  name: "afklist",
  description: "List AFK users in this server.",
  module: "afk",
  guildOnly: true,
  guildOwnerOnly: true,
  build: () => new SlashCommandBuilder().setName("afklist").setDescription("List AFK users in this server."),
  async run(ctx) {
    const guildId = ctx.guildId;
    if (!guildId) throw new Error("AFK needs a server.");
    const entries = await ctx.services.db.afk.listForGuild(guildId);
    if (entries.length === 0) return ctx.replyInfo("💤 AFK", "Nobody is AFK.");
    return ctx.reply(
      makeListCard(
        `AFK users (${entries.length})`,
        entries.map(
          (entry) => `${userMention(entry.userId)} — **${entry.reason}** *${afkSince(entry)}*`,
        ),
      ),
    );
  },
};

export const afkCleanCommand: CommandDef = {
  name: "afkclean",
  description: "Remove AFK entries for members who left.",
  module: "afk",
  guildOnly: true,
  guildOwnerOnly: true,
  build: () =>
    new SlashCommandBuilder().setName("afkclean").setDescription("Remove AFK entries for members who left."),
  async run(ctx) {
    const guildId = ctx.guildId;
    const guild = ctx.guild;
    if (!guildId || !guild) throw new Error("AFK needs a server.");
    await ctx.defer();

    const removed: string[] = [];
    for await (const page of ctx.services.db.afk.iterateForGuild(guildId)) {
      await mapWithConcurrency(page, 10, async (entry) => {
        const member = await guild.members.fetch(entry.userId).catch((error: unknown) => {
          if (typeof error === "object" && error !== null && "code" in error && error.code === 10007) {
            return null;
          }
          throw error;
        });
        if (!member) {
          const deleted = await ctx.services.db.afk.deleteEntry(entry.guildId, entry.userId);
          if (deleted) removed.push(entry.userId);
        }
      });
    }

    return ctx.replySuccess(
      "AFK cleaned",
      removed.length === 0 ? "Nothing to clean." : `Removed ${removed.length} stale entr${removed.length === 1 ? "y" : "ies"}.`,
    );
  },
};
