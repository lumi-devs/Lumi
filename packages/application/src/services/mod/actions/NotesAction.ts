import { container } from "@sapphire/framework";
import type { Guild, GuildMember, User } from "discord.js";

export interface NotesApplyOptions {
  guild: Guild;
  targetMember: GuildMember;
  moderator: User;
  reason: string;
}

/**
 * Adds a persistent staff-only note to a member - separate from warns and
 * moderation cases. Never DMed to the member and never counted toward warn
 * thresholds; visible only to staff via `/notes` or the dashboard.
 */
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
