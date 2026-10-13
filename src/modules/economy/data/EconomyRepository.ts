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

export interface EconomyBalance {
  guildId: string;
  userId: string;
  wallet: number;
  bank: number;
  lastPaydayAt: Date | null;
}

export interface EconomyLedgerEntry {
  id: number;
  guildId: string;
  userId: string;
  kind: EconomyTxnKind;
  amount: number;
  balanceAfter: number;
  reason: string | null;
  createdAt: Date;
}

function toBalance(account: EconomyAccount): EconomyBalance {
  return {
    guildId: account.guildId,
    userId: account.userId,
    wallet: Number(account.wallet),
    bank: Number(account.bank),
    lastPaydayAt: account.lastPaydayAt,
  };
}

function toLedgerEntry(entry: EconomyTransaction): EconomyLedgerEntry {
  return {
    id: entry.id,
    guildId: entry.guildId,
    userId: entry.userId,
    kind: entry.kind,
    amount: Number(entry.amount),
    balanceAfter: Number(entry.balanceAfter),
    reason: entry.reason,
    createdAt: entry.createdAt,
  };
}

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
  dailyCap?: number;
  dayStart?: Date;
}

interface EconomyPaydayInput {
  guildId: string;
  userId: string;
  amount: number;
  notBefore: Date;
  now: Date;
  startWallet: number;
  startBank: number;
  maxBalance?: number;
}

export class EconomyRepository extends Repository {
  public async findAccount(
    guildId: string,
    userId: string,
  ): Promise<EconomyBalance | null> {
    const account = await this.prisma.economyAccount.findUnique({
      where: { guildId_userId: { guildId, userId } },
    });
    return account ? toBalance(account) : null;
  }

  public async ensureAccount(
    guildId: string,
    userId: string,
    startWallet: number,
    startBank: number,
  ): Promise<EconomyBalance> {
    await this.db.ensureGuild(guildId);
    const account = await this.prisma.economyAccount.upsert({
      where: { guildId_userId: { guildId, userId } },
      update: {},
      create: { guildId, userId, wallet: BigInt(startWallet), bank: BigInt(startBank) },
    });
    return toBalance(account);
  }

  public async applyMutation(
    input: EconomyMutationInput,
  ): Promise<{ account: EconomyBalance; balanceAfter: number }> {
    const { guildId, userId } = input;
    await this.db.ensureGuild(guildId);
    return this.prisma.$transaction(async (tx) => {
      await tx.economyAccount.upsert({
        where: { guildId_userId: { guildId, userId } },
        update: {},
        create: {
          guildId,
          userId,
          wallet: BigInt(input.startWallet),
          bank: BigInt(input.startBank),
        },
      });

      const where: Record<string, unknown> = { guildId, userId };
      if (input.walletDelta < 0) {
        where["wallet"] = { gte: BigInt(-input.walletDelta) };
      }
      if (input.bankDelta < 0) {
        where["bank"] = { gte: BigInt(-input.bankDelta) };
      }
      const { count } = await tx.economyAccount.updateMany({
        where,
        data: {
          wallet: { increment: BigInt(input.walletDelta) },
          bank: { increment: BigInt(input.bankDelta) },
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
      const balanceAfter = Number(account.wallet) + Number(account.bank);
      await tx.economyTransaction.create({
        data: {
          guildId,
          userId,
          kind: input.kind,
          amount: BigInt(input.walletDelta + input.bankDelta),
          balanceAfter: BigInt(balanceAfter),
          reason: input.reason ?? null,
          createdAt: new Date(),
        },
      });
      return { account: toBalance(account), balanceAfter };
    });
  }

  public async applyTransfer(
    input: EconomyTransferInput,
  ): Promise<{ from: EconomyBalance; to: EconomyBalance }> {
    const { guildId, fromUserId, toUserId } = input;
    await this.db.ensureGuild(guildId);
    const sortedUserIds = [fromUserId, toUserId].sort();
    return this.prisma.$transaction(async (tx) => {
      for (const userId of sortedUserIds) {
        await tx.economyAccount.upsert({
          where: { guildId_userId: { guildId, userId } },
          update: {},
          create: {
            guildId,
            userId,
            wallet: BigInt(input.startWallet),
            bank: BigInt(input.startBank),
          },
        });
      }

      const { count } = await tx.economyAccount.updateMany({
        where: {
          guildId,
          userId: fromUserId,
          wallet: { gte: BigInt(input.amount) },
        },
        data: { wallet: { decrement: BigInt(input.amount) } },
      });
      if (count === 0) {
        throw Object.assign(new Error("Insufficient funds."), {
          code: "InsufficientFunds",
        });
      }

      const net = input.amount - input.fee;
      await tx.economyAccount.update({
        where: { guildId_userId: { guildId, userId: toUserId } },
        data: { wallet: { increment: BigInt(net) } },
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
            amount: BigInt(-input.amount),
            balanceAfter: BigInt(
              Number((from as EconomyAccount).wallet) + Number((from as EconomyAccount).bank),
            ),
            reason: input.reason ?? null,
            createdAt: now,
          },
          {
            guildId,
            userId: toUserId,
            kind: "transfer_in",
            amount: BigInt(net),
            balanceAfter: BigInt(
              Number((to as EconomyAccount).wallet) + Number((to as EconomyAccount).bank),
            ),
            reason: input.reason ?? null,
            createdAt: now,
          },
        ],
      });
      return { from: toBalance(from as EconomyAccount), to: toBalance(to as EconomyAccount) };
    });
  }

  public async recordSlots(
    input: EconomySlotsInput,
  ): Promise<{ account: EconomyBalance; balanceAfter: number }> {
    const { guildId, userId } = input;
    await this.db.ensureGuild(guildId);
    return this.prisma.$transaction(async (tx) => {
      await tx.economyAccount.upsert({
        where: { guildId_userId: { guildId, userId } },
        update: {},
        create: {
          guildId,
          userId,
          wallet: BigInt(input.startWallet),
          bank: BigInt(input.startBank),
        },
      });

      if (input.dailyCap !== undefined && input.dailyCap > 0 && input.dayStart) {
        const wagered = await tx.economyTransaction.aggregate({
          _sum: { amount: true },
          where: {
            guildId,
            userId,
            kind: "slots_bid",
            createdAt: { gte: input.dayStart },
          },
        });
        if (-Number(wagered._sum.amount ?? 0) + input.bid > input.dailyCap) {
          throw Object.assign(new Error("Daily slots cap reached."), {
            code: "LimitExceeded",
          });
        }
      }

      const { count } = await tx.economyAccount.updateMany({
        where: { guildId, userId, wallet: { gte: BigInt(input.bid) } },
        data: { wallet: { decrement: BigInt(input.bid) } },
      });
      if (count === 0) {
        throw Object.assign(new Error("Insufficient funds."), {
          code: "InsufficientFunds",
        });
      }
      if (input.win > 0) {
        await tx.economyAccount.update({
          where: { guildId_userId: { guildId, userId } },
          data: { wallet: { increment: BigInt(input.win) } },
        });
      }

      const account = (await tx.economyAccount.findUnique({
        where: { guildId_userId: { guildId, userId } },
      })) as EconomyAccount;
      const balanceAfter = Number(account.wallet) + Number(account.bank);
      const now = new Date();
      await tx.economyTransaction.create({
        data: {
          guildId,
          userId,
          kind: "slots_bid",
          amount: BigInt(-input.bid),
          balanceAfter: BigInt(balanceAfter - input.win),
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
            amount: BigInt(input.win),
            balanceAfter: BigInt(balanceAfter),
            reason: input.reason ?? null,
            createdAt: now,
          },
        });
      }
      return { account: toBalance(account), balanceAfter };
    });
  }

  public async claimPayday(
    input: EconomyPaydayInput,
  ): Promise<{ account: EconomyBalance; balanceAfter: number } | null> {
    const { guildId, userId } = input;
    await this.db.ensureGuild(guildId);
    return this.prisma.$transaction(async (tx) => {
      await tx.economyAccount.upsert({
        where: { guildId_userId: { guildId, userId } },
        update: {},
        create: {
          guildId,
          userId,
          wallet: BigInt(input.startWallet),
          bank: BigInt(input.startBank),
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
          wallet: { increment: BigInt(input.amount) },
          lastPaydayAt: input.now,
        },
      });
      if (count === 0) return null;

      let account = (await tx.economyAccount.findUnique({
        where: { guildId_userId: { guildId, userId } },
      })) as EconomyAccount;
      if (input.maxBalance !== undefined) {
        const excess = Number(account.wallet) + Number(account.bank) - input.maxBalance;
        if (excess > 0) {
          account = await tx.economyAccount.update({
            where: { guildId_userId: { guildId, userId } },
            data: { wallet: { decrement: BigInt(excess) } },
          });
        }
      }
      const balanceAfter = Number(account.wallet) + Number(account.bank);
      await tx.economyTransaction.create({
        data: {
          guildId,
          userId,
          kind: "payday",
          amount: BigInt(input.amount),
          balanceAfter: BigInt(balanceAfter),
          createdAt: input.now,
        },
      });
      return { account: toBalance(account), balanceAfter };
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
      entries: rows.map((row) => ({
        userId: row.userId,
        wallet: Number(row["wallet"]),
        bank: Number(row["bank"]),
        total: Number(row["wallet"]) + Number(row["bank"]),
        rank: Number(row.rank),
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
    return Number(result._sum.amount ?? 0);
  }

  public async findTransactionsForUser(
    userId: string,
    pageSize = 1_000,
  ): Promise<EconomyLedgerEntry[]> {
    const transactions: EconomyLedgerEntry[] = [];
    let cursor: number | undefined;

    for (;;) {
      const page = await this.prisma.economyTransaction.findMany({
        where: { userId },
        orderBy: { id: "asc" },
        take: pageSize,
        ...(cursor === undefined ? {} : { cursor: { id: cursor }, skip: 1 }),
      });

      transactions.push(...page.map(toLedgerEntry));
      if (page.length < pageSize) return transactions;
      cursor = page[page.length - 1]!.id;
    }
  }

  public async findAccountsForUser(
    userId: string,
    pageSize = 1_000,
  ): Promise<EconomyBalance[]> {
    const accounts: EconomyBalance[] = [];
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

      accounts.push(...page.map(toBalance));
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
        wallet: BigInt(0),
        bank: BigInt(0),
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
        OR: [{ wallet: { gt: BigInt(0) } }, { bank: { gt: BigInt(0) } }],
      },
      data: { wallet: BigInt(0), bank: BigInt(0) },
    });
    return count;
  }
}
