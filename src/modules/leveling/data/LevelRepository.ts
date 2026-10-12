import type { LevelAccount, LevelXpGain } from "@prisma/client";
import { Repository } from "#src/lib/prisma/repositories/Repository.js";
import {
  rankedAccountPage,
  rankedGainWindow,
  rankPosition,
  type AccountRankRow,
} from "#src/lib/prisma/Ranking.js";
import { MaxLevel, StartLevel } from "#src/modules/leveling/Constants.js";
import {
  xpForLevel,
  type LevelFormula,
} from "#src/modules/leveling/services/Formulas.js";

interface AwardXpInput {
  guildId: string;
  userId: string;
  amount: number;
  formula: LevelFormula;
  notBefore: Date | null;
  now: Date;
  countMessage: boolean;
}

interface AwardVoiceInput {
  guildId: string;
  userId: string;
  minutes: number;
  amount: number;
  formula: LevelFormula;
}

function levelUp(
  formula: LevelFormula,
  level: number,
  xp: number,
): { level: number; xp: number; gained: number } {
  let gained = 0;
  let lv = Math.max(StartLevel, level);
  let progress = Math.max(0, xp);
  while (lv < MaxLevel) {
    const needed = xpForLevel(formula, lv);
    if (progress < needed) break;
    progress -= needed;
    lv++;
    gained++;
  }
  return { level: lv, xp: progress, gained };
}

export interface LevelBoardEntry {
  userId: string;
  level: number;
  xp: number;
  messageCount: number;
  voiceMinutes: number;
  rank: number;
}

const LevelBoardColumns =
  '"level", "xp", "message_count" AS "messageCount", "voice_minutes" AS "voiceMinutes"';

function toBoardEntries(rows: AccountRankRow[]): {
  entries: LevelBoardEntry[];
  total: number;
} {
  return {
    entries: rows.map((r) => ({
      userId: r.userId,
      level: Number(r["level"]),
      xp: Number(r["xp"]),
      messageCount: Number(r["messageCount"]),
      voiceMinutes: Number(r["voiceMinutes"]),
      rank: Number(r.rank),
    })),
    total: rows.length > 0 ? Number(rows[0]!.fullCount) : 0,
  };
}

export class LevelRepository extends Repository {
  public findAccount(
    guildId: string,
    userId: string,
  ): Promise<LevelAccount | null> {
    return this.prisma.levelAccount.findUnique({
      where: { guildId_userId: { guildId, userId } },
    });
  }

  public async ensureAccount(
    guildId: string,
    userId: string,
  ): Promise<LevelAccount> {
    await this.db.ensureGuild(guildId);
    return this.prisma.levelAccount.upsert({
      where: { guildId_userId: { guildId, userId } },
      update: {},
      create: { guildId, userId, level: StartLevel, xp: 0 },
    });
  }

  public async awardXp(
    input: AwardXpInput,
  ): Promise<{ account: LevelAccount; granted: boolean; levelsGained: number }> {
    const { guildId, userId } = input;
    await this.db.ensureGuild(guildId);
    return this.prisma.$transaction(async (tx) => {
      await tx.levelAccount.upsert({
        where: { guildId_userId: { guildId, userId } },
        update: {},
        create: { guildId, userId, level: StartLevel, xp: 0 },
      });

      let granted = false;
      if (input.amount > 0) {
        const where: Record<string, unknown> = { guildId, userId };
        if (input.notBefore !== null) {
          where["OR"] = [
            { lastXpAt: null },
            { lastXpAt: { lte: input.notBefore } },
          ];
        }
        const { count } = await tx.levelAccount.updateMany({
          where,
          data: {
            xp: { increment: input.amount },
            totalXp: { increment: input.amount },
            ...(input.countMessage
              ? { messageCount: { increment: 1 } }
              : {}),
            lastXpAt: input.now,
          },
        });
        granted = count > 0;
      } else if (input.countMessage) {
        await tx.levelAccount.update({
          where: { guildId_userId: { guildId, userId } },
          data: { messageCount: { increment: 1 } },
        });
      }

      const current = (await tx.levelAccount.findUnique({
        where: { guildId_userId: { guildId, userId } },
      })) as LevelAccount;
      const next = levelUp(input.formula, current.level, current.xp);
      if (next.gained === 0) {
        return { account: current, granted, levelsGained: 0 };
      }
      const account = await tx.levelAccount.update({
        where: { guildId_userId: { guildId, userId } },
        data: { level: next.level, xp: next.xp },
      });
      return { account, granted, levelsGained: next.gained };
    });
  }

  public async awardVoice(
    input: AwardVoiceInput,
  ): Promise<{ account: LevelAccount; levelsGained: number }> {
    const { guildId, userId } = input;
    await this.db.ensureGuild(guildId);
    return this.prisma.$transaction(async (tx) => {
      await tx.levelAccount.upsert({
        where: { guildId_userId: { guildId, userId } },
        update: {},
        create: { guildId, userId, level: StartLevel, xp: 0 },
      });

      await tx.levelAccount.update({
        where: { guildId_userId: { guildId, userId } },
        data: {
          xp: { increment: input.amount },
          totalXp: { increment: input.amount },
          voiceMinutes: { increment: input.minutes },
        },
      });

      const current = (await tx.levelAccount.findUnique({
        where: { guildId_userId: { guildId, userId } },
      })) as LevelAccount;
      if (input.amount > 0) {
        await tx.levelXpGain.create({
          data: {
            guildId,
            userId,
            amount: input.amount,
            source: "voice",
          },
        });
      }
      const next = levelUp(input.formula, current.level, current.xp);
      if (next.gained === 0) {
        return { account: current, levelsGained: 0 };
      }
      const account = await tx.levelAccount.update({
        where: { guildId_userId: { guildId, userId } },
        data: { level: next.level, xp: next.xp },
      });
      return { account, levelsGained: next.gained };
    });
  }

  public async setLevelXp(
    guildId: string,
    userId: string,
    level: number,
    xp: number,
    totalXp: number,
  ): Promise<LevelAccount> {
    await this.db.ensureGuild(guildId);
    return this.prisma.levelAccount.upsert({
      where: { guildId_userId: { guildId, userId } },
      update: { level, xp, totalXp },
      create: { guildId, userId, level, xp, totalXp },
    });
  }

  public async deleteAccount(
    guildId: string,
    userId: string,
  ): Promise<void> {
    await this.prisma.levelAccount
      .delete({ where: { guildId_userId: { guildId, userId } } })
      .catch(() => null);
  }

  public async recordGain(
    guildId: string,
    userId: string,
    amount: number,
    source: string,
  ): Promise<LevelXpGain> {
    await this.db.ensureGuild(guildId);
    return this.prisma.levelXpGain.create({
      data: { guildId, userId, amount, source: source.slice(0, 16) },
    });
  }

  public async rankedAccounts(
    guildId: string,
    limit: number,
    offset: number,
  ): Promise<{ entries: LevelBoardEntry[]; total: number }> {
    const rows = await rankedAccountPage(
      this.prisma,
      "level_accounts",
      '"total_xp"',
      LevelBoardColumns,
      guildId,
      limit,
      offset,
    );
    return toBoardEntries(rows);
  }

  public async rankOf(
    guildId: string,
    userId: string,
  ): Promise<number | null> {
    return rankPosition(
      this.prisma,
      "level_accounts",
      '"total_xp"',
      guildId,
      userId,
    );
  }

  public async rankedByVoice(
    guildId: string,
    limit: number,
    offset: number,
  ): Promise<{ entries: LevelBoardEntry[]; total: number }> {
    const rows = await rankedAccountPage(
      this.prisma,
      "level_accounts",
      '"voice_minutes"',
      LevelBoardColumns,
      guildId,
      limit,
      offset,
    );
    return toBoardEntries(rows);
  }

  public async rankedWindow(
    guildId: string,
    since: Date,
    limit: number,
    offset: number,
  ): Promise<{ entries: { userId: string; total: number; rank: number }[]; total: number }> {
    const rows = await rankedGainWindow(
      this.prisma,
      guildId,
      since,
      limit,
      offset,
    );
    return {
      entries: rows.map((r) => ({
        userId: r.userId,
        total: Number(r.total),
        rank: Number(r.rank),
      })),
      total: rows.length > 0 ? Number(rows[0]!.fullCount) : 0,
    };
  }

  public async findAccountsForUser(
    userId: string,
    pageSize = 1_000,
  ): Promise<LevelAccount[]> {
    const accounts: LevelAccount[] = [];
    let cursor: string | undefined;

    for (;;) {
      const page = await this.prisma.levelAccount.findMany({
        where: { userId },
        orderBy: { guildId: "asc" },
        take: pageSize,
        ...(cursor === undefined
          ? {}
          : { cursor: { guildId_userId: { guildId: cursor, userId } }, skip: 1 }),
      });

      accounts.push(...page);
      if (page.length < pageSize) return accounts;
      cursor = page[page.length - 1]!.guildId;
    }
  }

  public async deleteForUser(userId: string): Promise<number> {
    const { count } = await this.prisma.levelAccount.deleteMany({
      where: { userId },
    });
    return count;
  }
}
