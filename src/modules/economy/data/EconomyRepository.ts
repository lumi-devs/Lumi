import type {
  EconomyAccount,
  EconomyTransaction,
  EconomyTxnKind,
} from "@prisma/client";
import { Repository } from "#src/lib/prisma/repositories/Repository.js";
import {
  rankedAccountPage,
  rankPosition,
} from "#src/lib/prisma/Ranking.js";

interface EconomyMutationInput {
  guildId: string;
  userId: string;
  walletDelta: number;
  bankDelta: number;
  kind: EconomyTxnKind;
  reason?: string;
  startWallet: number;
  startBank: number;
}

interface EconomyTransferInput {
  guildId: string;
  fromUserId: string;
  toUserId: string;
  amount: number;
  fee: number;
  reason?: string;
  startWallet: number;
  startBank: number;
}

interface EconomySlotsInput {
  guildId: string;
  userId: string;
  bid: number;
  win: number;
  reason?: string;
  startWallet: number;
  startBank: number;
}

interface EconomyPaydayInput {
  guildId: string;
  userId: string;
  amount: number;
  notBefore: Date;
  now: Date;
  startWallet: number;
  startBank: number;
}

export class EconomyRepository extends Repository {
  public findAccount(
    guildId: string,
    userId: string,
  ): Promise<EconomyAccount | null> {
    return this.prisma.economyAccount.findUnique({
      where: { guildId_userId: { guildId, userId } },
    });
  }

  public async ensureAccount(
    guildId: string,
    userId: string,
    startWallet: number,
    startBank: number,
  ): Promise<EconomyAccount> {
    await this.db.ensureGuild(guildId);
    return this.prisma.economyAccount.upsert({
      where: { guildId_userId: { guildId, userId } },
      update: {},
      create: { guildId, userId, wallet: startWallet, bank: startBank },
    });
  }

  public async applyMutation(
    input: EconomyMutationInput,
  ): Promise<{ account: EconomyAccount; balanceAfter: number }> {
    const { guildId, userId } = input;
    await this.db.ensureGuild(guildId);
    return this.prisma.$transaction(async (tx) => {
      await tx.economyAccount.upsert({
        where: { guildId_userId: { guildId, userId } },
        update: {},
        create: {
          guildId,
          userId,
          wallet: input.startWallet,
          bank: input.startBank,
        },
      });

      const where: Record<string, unknown> = { guildId, userId };
      if (input.walletDelta < 0) {
        where["wallet"] = { gte: -input.walletDelta };
      }
      if (input.bankDelta < 0) {
        where["bank"] = { gte: -input.bankDelta };
      }
      const { count } = await tx.economyAccount.updateMany({
        where,
        data: {
          wallet: { increment: input.walletDelta },
          bank: { increment: input.bankDelta },
        },
      });
      if (count === 0) {
        throw Object.assign(new Error("Insufficient funds."), {
          code: "InsufficientFunds",
        });
      }

      const account = (await tx.economyAccount.findUnique({
        where: { guildId_userId: { guildId, userId } },
      })) as EconomyAccount;
      const balanceAfter = account.wallet + account.bank;
      await tx.economyTransaction.create({
        data: {
          guildId,
          userId,
          kind: input.kind,
          amount: input.walletDelta + input.bankDelta,
          balanceAfter,
          reason: input.reason ?? null,
          createdAt: new Date(),
        },
      });
      return { account, balanceAfter };
    });
  }

  public async applyTransfer(
    input: EconomyTransferInput,
  ): Promise<{ from: EconomyAccount; to: EconomyAccount }> {
    const { guildId, fromUserId, toUserId } = input;
    await this.db.ensureGuild(guildId);
    const sortedUserIds = [fromUserId, toUserId].sort();
    return this.prisma.$transaction(async (tx) => {
      for (const uId of sortedUserIds) {
        await tx.economyAccount.upsert({
          where: { guildId_userId: { guildId, userId: uId } },
          update: {},
          create: {
            guildId,
            userId: uId,
            wallet: input.startWallet,
            bank: input.startBank,
          },
        });
      }

      const { count } = await tx.economyAccount.updateMany({
        where: {
          guildId,
          userId: fromUserId,
          wallet: { gte: input.amount },
        },
        data: { wallet: { decrement: input.amount } },
      });
      if (count === 0) {
        throw Object.assign(new Error("Insufficient funds."), {
          code: "InsufficientFunds",
        });
      }

      const net = input.amount - input.fee;
      await tx.economyAccount.update({
        where: { guildId_userId: { guildId, userId: toUserId } },
        data: { wallet: { increment: net } },
      });

      const [from, to] = await Promise.all([
        tx.economyAccount.findUnique({
          where: { guildId_userId: { guildId, userId: fromUserId } },
        }),
        tx.economyAccount.findUnique({
          where: { guildId_userId: { guildId, userId: toUserId } },
        }),
      ]);
      const now = new Date();
      await tx.economyTransaction.createMany({
        data: [
          {
            guildId,
            userId: fromUserId,
            kind: "transfer_out",
            amount: -input.amount,
            balanceAfter:
              (from as EconomyAccount).wallet + (from as EconomyAccount).bank,
            reason: input.reason ?? null,
            createdAt: now,
          },
          {
            guildId,
            userId: toUserId,
            kind: "transfer_in",
            amount: net,
            balanceAfter:
              (to as EconomyAccount).wallet + (to as EconomyAccount).bank,
            reason: input.reason ?? null,
            createdAt: now,
          },
        ],
      });
      return { from: from as EconomyAccount, to: to as EconomyAccount };
    });
  }

  public async recordSlots(
    input: EconomySlotsInput,
  ): Promise<{ account: EconomyAccount; balanceAfter: number }> {
    const { guildId, userId } = input;
    await this.db.ensureGuild(guildId);
    return this.prisma.$transaction(async (tx) => {
      await tx.economyAccount.upsert({
        where: { guildId_userId: { guildId, userId } },
        update: {},
        create: {
          guildId,
          userId,
          wallet: input.startWallet,
          bank: input.startBank,
        },
      });

      const { count } = await tx.economyAccount.updateMany({
        where: { guildId, userId, wallet: { gte: input.bid } },
        data: { wallet: { decrement: input.bid } },
      });
      if (count === 0) {
        throw Object.assign(new Error("Insufficient funds."), {
          code: "InsufficientFunds",
        });
      }
      if (input.win > 0) {
        await tx.economyAccount.update({
          where: { guildId_userId: { guildId, userId } },
          data: { wallet: { increment: input.win } },
        });
      }

      const account = (await tx.economyAccount.findUnique({
        where: { guildId_userId: { guildId, userId } },
      })) as EconomyAccount;
      const balanceAfter = account.wallet + account.bank;
      const now = new Date();
      await tx.economyTransaction.create({
        data: {
          guildId,
          userId,
          kind: "slots_bid",
          amount: -input.bid,
          balanceAfter: balanceAfter - input.win,
          reason: input.reason ?? null,
          createdAt: now,
        },
      });
      if (input.win > 0) {
        await tx.economyTransaction.create({
          data: {
            guildId,
            userId,
            kind: "slots_win",
            amount: input.win,
            balanceAfter,
            reason: input.reason ?? null,
            createdAt: now,
          },
        });
      }
      return { account, balanceAfter };
    });
  }

  public async claimPayday(
    input: EconomyPaydayInput,
  ): Promise<{ account: EconomyAccount; balanceAfter: number } | null> {
    const { guildId, userId } = input;
    await this.db.ensureGuild(guildId);
    return this.prisma.$transaction(async (tx) => {
      await tx.economyAccount.upsert({
        where: { guildId_userId: { guildId, userId } },
        update: {},
        create: {
          guildId,
          userId,
          wallet: input.startWallet,
          bank: input.startBank,
          lastPaydayAt: null,
        },
      });

      const { count } = await tx.economyAccount.updateMany({
        where: {
          guildId,
          userId,
          OR: [
            { lastPaydayAt: null },
            { lastPaydayAt: { lte: input.notBefore } },
          ],
        },
        data: {
          wallet: { increment: input.amount },
          lastPaydayAt: input.now,
        },
      });
      if (count === 0) return null;

      const account = (await tx.economyAccount.findUnique({
        where: { guildId_userId: { guildId, userId } },
      })) as EconomyAccount;
      const balanceAfter = account.wallet + account.bank;
      await tx.economyTransaction.create({
        data: {
          guildId,
          userId,
          kind: "payday",
          amount: input.amount,
          balanceAfter,
          createdAt: input.now,
        },
      });
      return { account, balanceAfter };
    });
  }

  public async rankedAccounts(
    guildId: string,
    limit: number,
    offset: number,
  ): Promise<{ entries: { userId: string; wallet: number; bank: number; total: number; rank: number }[]; total: number }> {
    const rows = await rankedAccountPage(
      this.prisma,
      "economy_accounts",
      '("wallet" + "bank")',
      '"wallet", "bank"',
      guildId,
      limit,
      offset,
    );
    return {
      entries: rows.map((r) => ({
        userId: r.userId,
        wallet: Number(r["wallet"]),
        bank: Number(r["bank"]),
        total: Number(r["wallet"]) + Number(r["bank"]),
        rank: Number(r.rank),
      })),
      total: rows.length > 0 ? Number(rows[0]!.fullCount) : 0,
    };
  }

  public async rankOf(guildId: string, userId: string): Promise<number | null> {
    return rankPosition(
      this.prisma,
      "economy_accounts",
      '("wallet" + "bank")',
      guildId,
      userId,
    );
  }

  public async sumKindsSince(
    guildId: string,
    userId: string,
    kinds: EconomyTxnKind[],
    since: Date,
  ): Promise<number> {
    const result = await this.prisma.economyTransaction.aggregate({
      _sum: { amount: true },
      where: { guildId, userId, kind: { in: kinds }, createdAt: { gte: since } },
    });
    return result._sum.amount ?? 0;
  }

  public async findTransactionsForUser(
    userId: string,
    pageSize = 1_000,
  ): Promise<EconomyTransaction[]> {
    const transactions: EconomyTransaction[] = [];
    let cursor: number | undefined;

    for (;;) {
      const page = await this.prisma.economyTransaction.findMany({
        where: { userId },
        orderBy: { id: "asc" },
        take: pageSize,
        ...(cursor === undefined ? {} : { cursor: { id: cursor }, skip: 1 }),
      });

      transactions.push(...page);
      if (page.length < pageSize) return transactions;
      cursor = page[page.length - 1]!.id;
    }
  }

  public async findAccountsForUser(
    userId: string,
    pageSize = 1_000,
  ): Promise<EconomyAccount[]> {
    const accounts: EconomyAccount[] = [];
    let cursor: string | undefined;

    for (;;) {
      const page = await this.prisma.economyAccount.findMany({
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

  public async deleteForUser(
    userId: string,
  ): Promise<{ accounts: number; transactions: number }> {
    const [accounts, transactions] = await Promise.all([
      this.prisma.economyAccount.deleteMany({ where: { userId } }),
      this.prisma.economyTransaction.deleteMany({ where: { userId } }),
    ]);
    return { accounts: accounts.count, transactions: transactions.count };
  }

  public async purgeOldTransactions(date: Date): Promise<number> {
    const { count } = await this.prisma.economyTransaction.deleteMany({
      where: { createdAt: { lt: date } },
    });
    return count;
  }

  public async pruneZeroBalances(guildId?: string, userId?: string): Promise<number> {
    const { count } = await this.prisma.economyAccount.deleteMany({
      where: {
        wallet: 0,
        bank: 0,
        ...(guildId ? { guildId } : {}),
        ...(userId ? { userId } : {}),
      },
    });
    return count;
  }

  public async wipeGuild(guildId: string): Promise<number> {
    const { count } = await this.prisma.economyAccount.updateMany({
      where: {
        guildId,
        OR: [{ wallet: { gt: 0 } }, { bank: { gt: 0 } }],
      },
      data: { wallet: 0, bank: 0 },
    });
    return count;
  }
}
