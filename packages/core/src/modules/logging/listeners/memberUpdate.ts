import { Events } from "@sapphire/framework";
import { ApplyOptions } from "@sapphire/decorators";
import { Colors, type GuildMember, type PartialGuildMember } from "discord.js";
import { roleMention, userMention } from "@discordjs/formatters";
import { escapeMarkdown } from "@discordjs/formatters";
import { ModuleListener } from "#lib/module-system/ModuleListener.js";
import { isToggleEnabled, sendLog } from "../lib/send.js";

@ApplyOptions<ModuleListener.Options>({
  name: "loggingMemberUpdate",
  event: Events.GuildMemberUpdate,
  module: "logging",
})
export class LoggingMemberUpdateListener extends ModuleListener<
  typeof Events.GuildMemberUpdate
> {
  protected async handle(
    oldMember: GuildMember | PartialGuildMember,
    newMember: GuildMember,
  ): Promise<void> {
    const guildId = newMember.guild.id;

    if (!oldMember.partial && oldMember.nickname !== newMember.nickname) {
      if (await isToggleEnabled(guildId, "nickname_changes")) {
        await sendLog(guildId, Colors.Blue, "Nickname Changed", [
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
        (await isToggleEnabled(guildId, "role_changes"))
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
        await sendLog(guildId, Colors.Purple, "Roles Updated", lines);
      }
    }
  }
}
