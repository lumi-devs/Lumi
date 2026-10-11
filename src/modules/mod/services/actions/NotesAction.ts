import { container } from "#src/lib/Services.js";
import type { Guild, GuildMember, User } from "discord.js";

interface NotesApplyOptions {
  guild: Guild;
  targetMember: GuildMember;
  moderator: User;
  reason: string;
}

export class NotesAction {
  public static async apply(options: NotesApplyOptions) {
    const { guild, targetMember, moderator, reason } = options;

    await container.db.ensureGuild(guild.id);
    const note = await container.db.modNotes.create(
      guild.id,
      targetMember.id,
      moderator.id,
      reason,
    );

    return { note };
  }
}
