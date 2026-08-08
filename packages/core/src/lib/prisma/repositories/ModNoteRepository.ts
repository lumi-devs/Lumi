import type { ModNote } from "@prisma/client";
import { Repository } from "#lib/prisma/repositories/Repository.js";

/**
 * Staff-only member notes (`ModNote`), owned by the `mod` module. Separate
 * from `ModerationCase` - notes are never shown to the member and don't
 * count toward warn thresholds. Pure persistence, no caching.
 */
export class ModNoteRepository extends Repository {
  public create(
    guildId: string,
    userId: string,
    authorId: string,
    message: string,
  ): Promise<ModNote> {
    return this.prisma.modNote.create({
      data: { guildId, userId, authorId, message },
    });
  }

  public listForUser(guildId: string, userId: string): Promise<ModNote[]> {
    return this.prisma.modNote.findMany({
      where: { guildId, userId },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Deletes one note scoped to its guild, so a note id from another guild
   * can never be targeted. Returns whether a row was actually removed.
   */
  public async delete(guildId: string, id: number): Promise<boolean> {
    const { count } = await this.prisma.modNote.deleteMany({
      where: { id, guildId },
    });
    return count > 0;
  }
}
