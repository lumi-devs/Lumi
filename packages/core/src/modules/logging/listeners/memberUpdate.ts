import { Events } from "discord.js";
import type { Container } from "@lumi/lib/services.js";
import { Colors, type GuildMember, type PartialGuildMember } from "discord.js";
import { roleMention, userMention } from "@discordjs/formatters";
import { escapeMarkdown } from "@discordjs/formatters";
import { defineListener } from "@lumi/lib/listeners/listener-def.js";
import { isToggleEnabled, sendLog } from "@lumi/application/services/logging/send.js";

export const LoggingMemberUpdateListener = defineListener({
  name: "loggingMemberUpdate",
  event: Events.GuildMemberUpdate,
  module: "logging",
  async execute(
    services: Container,
    oldMember: GuildMember | PartialGuildMember,
    newMember: GuildMember,
  ): Promise<void> {
    const guildId = newMember.guild.id;

    if (!oldMember.partial && oldMember.nickname !== newMember.nickname) {
      if (await isToggleEnabled(services, guildId, "nickname_changes")) {
        await sendLog(services, guildId, "nickname_changes", Colors.Blue, "Nickname Changed", [
          `**Member**: ${userMention(newMember.id)} (${newMember.id})`,
          `**Before**: ${oldMember.nickname ? escapeMarkdown(oldMember.nickname) : "*none*"}`,
          `**After**: ${newMember.nickname ? escapeMarkdown(newMember.nickname) : "*none*"}`,
        ]);
      }
    }

    if (!oldMember.partial) {
      const added = newMember.roles.cache.filter(
        (r) => !oldMember.roles.cache.has(r.id),
      );
      const removed = oldMember.roles.cache.filter(
        (r) => !newMember.roles.cache.has(r.id),
      );
      if (
        (added.size > 0 || removed.size > 0) &&
        (await isToggleEnabled(services, guildId, "role_changes"))
      ) {
        const lines = [
          `**Member**: ${userMention(newMember.id)} (${newMember.id})`,
        ];
        if (added.size > 0)
          lines.push(
            `**Added**: ${added.map((r) => roleMention(r.id)).join(" ")}`,
          );
        if (removed.size > 0)
          lines.push(
            `**Removed**: ${removed.map((r) => roleMention(r.id)).join(" ")}`,
          );
        await sendLog(services, guildId, "role_changes", Colors.Purple, "Roles Updated", lines);
      }
    }
  },
});
