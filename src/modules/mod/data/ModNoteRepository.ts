import type { ModNote } from "@prisma/client";
import { Repository } from "#src/lib/prisma/repositories/Repository.js";

export class ModNoteRepository extends Repository {
  public async create(
    guildId: string,
    userId: string,
    authorId: string,
    message: string,
  ): Promise<ModNote> {
    await this.db.ensureGuild(guildId);
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

  public async delete(guildId: string, id: number): Promise<boolean> {
    const { count } = await this.prisma.modNote.deleteMany({
      where: { id, guildId },
    });
    return count > 0;
  }

  public async deleteUserData(userId: string): Promise<void> {
    await this.prisma.modNote.deleteMany({ where: { userId } });
    await this.prisma.modNote.updateMany({
      where: { authorId: userId },
      data: { authorId: "0" },
    });
  }
}
