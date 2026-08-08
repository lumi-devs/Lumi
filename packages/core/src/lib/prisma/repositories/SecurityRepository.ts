import type { GuildBackup, PanicState, VerificationPanel } from "@prisma/client";
import { Repository } from "#lib/prisma/repositories/Repository.js";
import type { GuildBackupData } from "#modules/security/lib/backup.js";

/** Channel id → prior `@everyone` SendMessages allow state (true/false/null). */
export type LockedChannelSnapshot = Record<string, boolean | null>;

/**
 * Persistent state owned by the `security` module: panic-mode snapshots and
 * the guild's verification panel message reference.
 */
export class SecurityRepository extends Repository {
  public getPanicState(guildId: string): Promise<PanicState | null> {
    return this.prisma.panicState.findUnique({ where: { guildId } });
  }

  public async savePanicState(input: {
    guildId: string;
    actorId: string;
    invitesPaused: boolean;
    lockedChannels: LockedChannelSnapshot;
  }): Promise<PanicState> {
    await this.db.ensureGuild(input.guildId);
    return this.prisma.panicState.upsert({
      where: { guildId: input.guildId },
      update: {
        actorId: input.actorId,
        invitesPaused: input.invitesPaused,
        lockedChannels: input.lockedChannels,
      },
      create: {
        guildId: input.guildId,
        actorId: input.actorId,
        invitesPaused: input.invitesPaused,
        lockedChannels: input.lockedChannels,
      },
    });
  }

  public async clearPanicState(guildId: string): Promise<boolean> {
    const result = await this.prisma.panicState.deleteMany({
      where: { guildId },
    });
    return result.count > 0;
  }

  public getVerificationPanel(
    guildId: string,
  ): Promise<VerificationPanel | null> {
    return this.prisma.verificationPanel.findUnique({ where: { guildId } });
  }

  public async saveVerificationPanel(input: {
    guildId: string;
    channelId: string;
    messageId: string;
  }): Promise<VerificationPanel> {
    await this.db.ensureGuild(input.guildId);
    return this.prisma.verificationPanel.upsert({
      where: { guildId: input.guildId },
      update: { channelId: input.channelId, messageId: input.messageId },
      create: input,
    });
  }

  public async deleteVerificationPanel(guildId: string): Promise<boolean> {
    const result = await this.prisma.verificationPanel.deleteMany({
      where: { guildId },
    });
    return result.count > 0;
  }

  public async createBackup(
    guildId: string,
    data: GuildBackupData,
  ): Promise<GuildBackup> {
    await this.db.ensureGuild(guildId);
    return this.prisma.guildBackup.create({
      data: { guildId, data: data as object },
    });
  }

  public getBackup(id: number): Promise<GuildBackup | null> {
    return this.prisma.guildBackup.findUnique({ where: { id } });
  }

  public getLatestBackup(guildId: string): Promise<GuildBackup | null> {
    return this.prisma.guildBackup.findFirst({
      where: { guildId },
      orderBy: { createdAt: "desc" },
    });
  }

  public listBackups(guildId: string, limit = 10): Promise<GuildBackup[]> {
    return this.prisma.guildBackup.findMany({
      where: { guildId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }

  /** Deletes every backup for the guild past the most recent `keep`. */
  public async pruneBackups(guildId: string, keep: number): Promise<number> {
    const stale = await this.prisma.guildBackup.findMany({
      where: { guildId },
      orderBy: { createdAt: "desc" },
      skip: keep,
      select: { id: true },
    });
    if (stale.length === 0) return 0;
    const result = await this.prisma.guildBackup.deleteMany({
      where: { id: { in: stale.map((b) => b.id) } },
    });
    return result.count;
  }
}
