import type { TempVcGenerator, TempVcRecord } from "@prisma/client";
import { Repository } from "#lib/prisma/repositories/Repository.js";

export interface TempVcRecordInput {
  ownerId: string;
  generatorId: string;
  name: string;
  number: number;
  locked: boolean;
  hidden: boolean;
}

/**
 * Persistent state owned by the `tempvc` module: generator (trigger) channels
 * and the live temporary-channel records. The module layers its own in-memory
 * registry + InvalidationBus on top; this is pure persistence.
 */
export class TempVcRepository extends Repository {
  public listGenerators(guildId: string): Promise<TempVcGenerator[]> {
    return this.prisma.tempVcGenerator.findMany({ where: { guildId } });
  }

  public async upsertGenerator(
    guildId: string,
    channelId: string,
    input: { name: string; limit: number },
  ): Promise<void> {
    await this.db.ensureGuild(guildId);
    await this.prisma.tempVcGenerator.upsert({
      where: { guildId_channelId: { guildId, channelId } },
      update: { name: input.name, limit: input.limit },
      create: { guildId, channelId, name: input.name, limit: input.limit },
    });
  }

  public async deleteGenerator(
    guildId: string,
    channelId: string,
  ): Promise<boolean> {
    const { count } = await this.prisma.tempVcGenerator.deleteMany({
      where: { guildId, channelId },
    });
    return count > 0;
  }

  public getRecord(
    guildId: string,
    channelId: string,
  ): Promise<TempVcRecord | null> {
    return this.prisma.tempVcRecord.findUnique({
      where: { guildId_channelId: { guildId, channelId } },
    });
  }

  public listRecords(guildId: string): Promise<TempVcRecord[]> {
    return this.prisma.tempVcRecord.findMany({ where: { guildId } });
  }

  public async upsertRecord(
    guildId: string,
    channelId: string,
    input: TempVcRecordInput,
  ): Promise<void> {
    await this.db.ensureGuild(guildId);
    await this.prisma.tempVcRecord.upsert({
      where: { guildId_channelId: { guildId, channelId } },
      update: input,
      create: { guildId, channelId, ...input },
    });
  }

  /**
   * Update only the named columns. Panel actions each carry a record they read
   * moments earlier; writing the whole row back would drop a concurrent
   * action's change (lock vs. hide vs. transfer on the same channel).
   */
  public async patchRecord(
    guildId: string,
    channelId: string,
    patch: Partial<TempVcRecordInput>,
  ): Promise<TempVcRecord | null> {
    const { count } = await this.prisma.tempVcRecord.updateMany({
      where: { guildId, channelId },
      data: patch,
    });
    if (count === 0) return null;
    return this.getRecord(guildId, channelId);
  }

  public async deleteRecord(guildId: string, channelId: string): Promise<void> {
    await this.prisma.tempVcRecord.deleteMany({
      where: { guildId, channelId },
    });
  }

  /** All records owned by a user across guilds (for GDPR deletion). */
  public findRecordsForOwner(ownerId: string): Promise<TempVcRecord[]> {
    return this.prisma.tempVcRecord.findMany({ where: { ownerId } });
  }

  public async deleteRecordsForOwner(ownerId: string): Promise<number> {
    const { count } = await this.prisma.tempVcRecord.deleteMany({
      where: { ownerId },
    });
    return count;
  }
}
