import { Events, type Message } from "discord.js";
import type { ListenerDef, LumiServices } from "@lumi/bot-kit";
import { claim } from "@lumi/redis";
import { makeInfoCard } from "@lumi/ui";
import { afkSince, NickPrefix, stripNickPrefix } from "./service.ts";

async function isCommand(services: LumiServices, message: Message<true>): Promise<boolean> {
  const guild = await services.db.guild.get(message.guildId);
  const prefix = guild?.prefix ?? services.runtime.defaultPrefix;
  if (!message.content.startsWith(prefix)) return false;
  const name = message.content.slice(prefix.length).trim().split(/\s+/)[0];
  return name !== undefined && services.modules.command(name)?.prefix === true;
}

export const afkMessageListener: ListenerDef<Events.MessageCreate> = {
  name: "afk-message",
  event: Events.MessageCreate,
  module: "afk",
  async execute(services, message) {
    if (!message.inGuild() || message.author.bot || message.system) return;
    const { guildId, channelId } = message;
    if (!(await services.modules.isEnabled(guildId, "afk"))) return;
    const userId = message.author.id;

    const ownEntry = await services.db.afk.findEntry(guildId, userId);
    if (ownEntry && !(await isCommand(services, message))) {
      const claimed = await claim(
        services.redis,
        services.keys.cooldown("afk:welcome", `${guildId}:${userId}`),
        5_000,
      );
      if (claimed) {
        await services.db.afk.deleteEntry(guildId, userId);
        const member = message.member;
        if (member && member.displayName.startsWith(NickPrefix)) {
          const next = stripNickPrefix(member.displayName);
          await member.setNickname(next).catch(() => null);
        }
        if (message.channel.isSendable()) {
          await message
            .reply(
              makeInfoCard("👋 Welcome back", `You were AFK for **${afkSince(ownEntry)}**.`),
            )
            .catch(() => null);
        }
      }
    }

    const mentioned = message.mentions.users.filter((user) => user.id !== userId && !user.bot);
    if (mentioned.size === 0) return;

    const entries = await services.db.afk.findEntries(guildId, [...mentioned.keys()]);
    if (entries.length === 0) return;

    const claimed = await claim(
      services.redis,
      services.keys.cooldown("afk:mention", channelId),
      5_000,
    );
    if (!claimed || !message.channel.isSendable()) return;

    const lines = entries.map(
      (entry) => `<@${entry.userId}> is AFK — **${entry.reason}** *(${afkSince(entry)})*`,
    );
    const reply = await message
      .reply(makeInfoCard("💤 AFK", lines))
      .catch(() => null);
    if (!reply) return;
    setTimeout(() => void reply.delete().catch(() => undefined), 15_000).unref();
  },
};
