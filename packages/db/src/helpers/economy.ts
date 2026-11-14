import type { Prisma } from "@prisma/client";
import type { DbContext } from "../context.js";

const DayMs = 24 * 60 * 60 * 1000;

export type EconomyRewardField = "lastDailyAt" | "lastWeeklyAt" | "lastWorkAt";

export interface EconomyGuard {
  min?: bigint;
  max?: bigint;
  dailyCap?: bigint;
  transferCap?: bigint;
  fee?: bigint;
}

export interface EconomyBalanceSnapshot {
  balance: bigint;
  bankBalance: bigint;
  totalEarned: bigint;
  totalSpent: bigint;
  lastDailyAt: Date | null;
  lastWeeklyAt: Date | null;
  lastWorkAt: Date | null;
}

export type EconomyFailureReason =
  | "invalid_amount"
  | "invalid_recipient"
  | "below_minimum"
  | "above_maximum"
  | "transfer_cap_exceeded"
  | "daily_cap_exceeded"
  | "insufficient_funds";

export interface EconomyOperationResult {
  ok: boolean;
  reason?: EconomyFailureReason;
  fee: bigint;
  netAmount: bigint;
  balance?: EconomyBalanceSnapshot;
}

export interface EconomyBankInput {
  guildId: string;
  userId: string;
  amount: bigint;
  guard?: EconomyGuard;
  description?: string | null;
}

export interface EconomyTransferInput {
  guildId: string;
  fromUserId: string;
  toUserId: string;
  amount: bigint;
  guard?: EconomyGuard;
  outDescription?: string | null;
  inDescription?: string | null;
  feeDescription?: string | null;
}

export interface EconomyWalletLedger {
  type: string;
  description?: string | null;
}

export interface EconomyDebitOptions {
  trackSpent?: boolean;
  ledger?: EconomyWalletLedger;
}

export interface EconomyCreditOptions {
  trackEarned?: boolean;
  ledger?: EconomyWalletLedger;
}

const toSnapshot = (user: {
  balance: bigint;
  bankBalance: bigint;
  totalEarned: bigint;
  totalSpent: bigint;
  lastDailyAt: Date | null;
  lastWeeklyAt: Date | null;
  lastWorkAt: Date | null;
}): EconomyBalanceSnapshot => ({
  balance: user.balance,
  bankBalance: user.bankBalance,
  totalEarned: user.totalEarned,
  totalSpent: user.totalSpent,
  lastDailyAt: user.lastDailyAt,
  lastWeeklyAt: user.lastWeeklyAt,
  lastWorkAt: user.lastWorkAt,
});

const failed = (
  reason: EconomyFailureReason,
  fee = 0n,
  netAmount = 0n,
): EconomyOperationResult => ({ ok: false, reason, fee, netAmount });

const succeeded = (
  fee: bigint,
  netAmount: bigint,
  user: Parameters<typeof toSnapshot>[0],
): EconomyOperationResult => ({
  ok: true,
  fee,
  netAmount,
  balance: toSnapshot(user),
});

const validateAmount = (
  amount: bigint,
  guard: EconomyGuard,
  checkTransferCap = false,
): EconomyFailureReason | null => {
  if (amount <= 0n) return "invalid_amount";
  if (guard.min !== undefined && amount < guard.min) return "below_minimum";
  if (guard.max !== undefined && amount > guard.max) return "above_maximum";
  if (
    checkTransferCap &&
    guard.transferCap !== undefined &&
    amount > guard.transferCap
  ) {
    return "transfer_cap_exceeded";
  }
  return null;
};

const resolveFee = (amount: bigint, guard: EconomyGuard): bigint | null => {
  const fee = guard.fee ?? 0n;
  if (fee < 0n || fee > amount) return null;
  return fee;
};

async function dailyTotal(
  tx: Prisma.TransactionClient,
  guildId: string,
  userId: string,
  field: "fromUserId" | "toUserId",
  types: readonly string[],
): Promise<bigint> {
  const since = new Date(Date.now() - DayMs);
  const where: Prisma.EconomyTransactionWhereInput =
    field === "fromUserId"
      ? {
          guildId,
          fromUserId: userId,
          type: { in: [...types] },
          createdAt: { gte: since },
        }
      : {
          guildId,
          toUserId: userId,
          type: { in: [...types] },
          createdAt: { gte: since },
        };
  const result = await tx.economyTransaction.aggregate({
    where,
    _sum: { amount: true },
  });
  return result._sum.amount ?? 0n;
}

async function exceedsDailyCap(
  tx: Prisma.TransactionClient,
  guildId: string,
  userId: string,
  field: "fromUserId" | "toUserId",
  types: readonly string[],
  amount: bigint,
  dailyCap: bigint | undefined,
): Promise<boolean> {
  if (dailyCap === undefined) return false;
  const total = await dailyTotal(tx, guildId, userId, field, types);
  return total + amount > dailyCap;
}

export function createEconomyHelpers(ctx: DbContext) {
  const { prisma } = ctx;

  return {
    findUser: (guildId: string, userId: string) =>
      prisma.economyUser.findUnique({
        where: { guildId_userId: { guildId, userId } },
      }),
    async getBalance(
      guildId: string,
      userId: string,
    ): Promise<EconomyBalanceSnapshot | null> {
      const user = await prisma.economyUser.findUnique({
        where: { guildId_userId: { guildId, userId } },
      });
      return user ? toSnapshot(user) : null;
    },
    getOrCreate: (guildId: string, userId: string, startingBalance: bigint) =>
      prisma.economyUser.upsert({
        where: { guildId_userId: { guildId, userId } },
        update: {},
        create: {
          guildId,
          userId,
          balance: startingBalance,
          bankBalance: 0n,
          totalEarned: 0n,
          totalSpent: 0n,
        },
      }),
    async addBalance(
      guildId: string,
      userId: string,
      amount: bigint,
      ledger?: EconomyWalletLedger,
    ) {
      if (amount === 0n) return;
      const earned = amount > 0n ? amount : 0n;
      const spent = amount < 0n ? -amount : 0n;
      await prisma.$transaction(async (tx) => {
        await tx.economyUser.upsert({
          where: { guildId_userId: { guildId, userId } },
          update: {
            balance: { increment: amount },
            ...(earned > 0n ? { totalEarned: { increment: earned } } : {}),
            ...(spent > 0n ? { totalSpent: { increment: spent } } : {}),
          },
          create: {
            guildId,
            userId,
            balance: amount,
            bankBalance: 0n,
            totalEarned: earned,
            totalSpent: spent,
          },
        });
        if (ledger) {
          await tx.economyTransaction.create({
            data: {
              guildId,
              ...(amount > 0n ? { toUserId: userId } : { fromUserId: userId }),
              amount: amount > 0n ? amount : -amount,
              type: ledger.type,
              description: ledger.description ?? null,
            },
          });
        }
      });
    },
    async debit(
      guildId: string,
      userId: string,
      amount: bigint,
      options: EconomyDebitOptions = {},
    ): Promise<boolean> {
      if (amount <= 0n) return false;
      const trackSpent = options.trackSpent ?? true;
      const moved = await prisma.$transaction(async (tx) => {
        const result = await tx.economyUser.updateMany({
          where: { guildId, userId, balance: { gte: amount } },
          data: {
            balance: { decrement: amount },
            ...(trackSpent ? { totalSpent: { increment: amount } } : {}),
          },
        });
        if (result.count !== 1) return false;
        if (options.ledger) {
          await tx.economyTransaction.create({
            data: {
              guildId,
              fromUserId: userId,
              amount,
              type: options.ledger.type,
              description: options.ledger.description ?? null,
            },
          });
        }
        return true;
      });
      return moved;
    },
    async credit(
      guildId: string,
      userId: string,
      amount: bigint,
      options: EconomyCreditOptions = {},
    ) {
      if (amount <= 0n) return;
      const trackEarned = options.trackEarned ?? true;
      await prisma.$transaction(async (tx) => {
        await tx.economyUser.upsert({
          where: { guildId_userId: { guildId, userId } },
          update: {
            balance: { increment: amount },
            ...(trackEarned ? { totalEarned: { increment: amount } } : {}),
          },
          create: {
            guildId,
            userId,
            balance: amount,
            bankBalance: 0n,
            totalEarned: trackEarned ? amount : 0n,
            totalSpent: 0n,
          },
        });
        if (options.ledger) {
          await tx.economyTransaction.create({
            data: {
              guildId,
              toUserId: userId,
              amount,
              type: options.ledger.type,
              description: options.ledger.description ?? null,
            },
          });
        }
      });
    },
    async transfer(
      input: EconomyTransferInput,
    ): Promise<EconomyOperationResult> {
      const {
        guildId,
        fromUserId,
        toUserId,
        amount,
        guard = {},
        outDescription,
        inDescription,
        feeDescription,
      } = input;
      if (fromUserId === toUserId) return failed("invalid_recipient");
      const failure = validateAmount(amount, guard, true);
      const fee = resolveFee(amount, guard);
      if (failure || fee === null) {
        return failed(failure ?? "invalid_amount", fee ?? 0n);
      }
      const netAmount = amount - fee;

      const result = await prisma.$transaction(async (tx) => {
        if (
          await exceedsDailyCap(
            tx,
            guildId,
            fromUserId,
            "fromUserId",
            ["transfer_out"],
            amount,
            guard.dailyCap,
          )
        ) {
          return failed("daily_cap_exceeded", fee, netAmount);
        }

        const debit = await tx.economyUser.updateMany({
          where: { guildId, userId: fromUserId, balance: { gte: amount } },
          data: {
            balance: { decrement: amount },
            totalSpent: { increment: amount },
          },
        });
        if (debit.count !== 1) {
          return failed("insufficient_funds", fee, netAmount);
        }

        if (netAmount > 0n) {
          await tx.economyUser.upsert({
            where: { guildId_userId: { guildId, userId: toUserId } },
            update: {
              balance: { increment: netAmount },
              totalEarned: { increment: netAmount },
            },
            create: {
              guildId,
              userId: toUserId,
              balance: netAmount,
              bankBalance: 0n,
              totalEarned: netAmount,
              totalSpent: 0n,
            },
          });
        }

        const ledger: Prisma.EconomyTransactionCreateManyInput[] = [
          {
            guildId,
            fromUserId,
            amount,
            type: "transfer_out",
            description: outDescription ?? null,
          },
        ];
        if (netAmount > 0n) {
          ledger.push({
            guildId,
            toUserId,
            amount: netAmount,
            type: "transfer_in",
            description: inDescription ?? null,
          });
        }
        if (fee > 0n) {
          ledger.push({
            guildId,
            fromUserId,
            amount: fee,
            type: "tax",
            description: feeDescription ?? null,
          });
        }
        await tx.economyTransaction.createMany({ data: ledger });

        const user = await tx.economyUser.findUniqueOrThrow({
          where: { guildId_userId: { guildId, userId: fromUserId } },
        });
        return succeeded(fee, netAmount, user);
      });

      return result;
    },
    async refund(
      guildId: string,
      userId: string,
      amount: bigint,
      ledger?: EconomyWalletLedger,
    ) {
      if (amount <= 0n) return;
      await prisma.$transaction(async (tx) => {
        await tx.economyUser.update({
          where: { guildId_userId: { guildId, userId } },
          data: {
            balance: { increment: amount },
            totalSpent: { decrement: amount },
          },
        });
        if (ledger) {
          await tx.economyTransaction.create({
            data: {
              guildId,
              toUserId: userId,
              amount,
              type: ledger.type,
              description: ledger.description ?? null,
            },
          });
        }
      });
    },
    async depositToBank(
      input: EconomyBankInput,
    ): Promise<EconomyOperationResult> {
      const { guildId, userId, amount, guard = {}, description } = input;
      const failure = validateAmount(amount, guard);
      const fee = resolveFee(amount, guard);
      if (failure || fee === null) {
        return failed(failure ?? "invalid_amount", fee ?? 0n);
      }
      const netAmount = amount - fee;

      const result = await prisma.$transaction(async (tx) => {
        if (
          await exceedsDailyCap(
            tx,
            guildId,
            userId,
            "fromUserId",
            ["deposit"],
            amount,
            guard.dailyCap,
          )
        ) {
          return failed("daily_cap_exceeded", fee, netAmount);
        }

        const updated = await tx.economyUser.updateMany({
          where: { guildId, userId, balance: { gte: amount } },
          data: {
            balance: { decrement: amount },
            bankBalance: { increment: netAmount },
          },
        });
        if (updated.count !== 1) {
          return failed("insufficient_funds", fee, netAmount);
        }

        const ledger: Prisma.EconomyTransactionCreateManyInput[] = [
          {
            guildId,
            fromUserId: userId,
            amount,
            type: "deposit",
            description: description ?? null,
          },
        ];
        if (fee > 0n) {
          ledger.push({
            guildId,
            fromUserId: userId,
            amount: fee,
            type: "deposit_fee",
            description: "Deposit fee",
          });
        }
        await tx.economyTransaction.createMany({ data: ledger });

        const user = await tx.economyUser.findUniqueOrThrow({
          where: { guildId_userId: { guildId, userId } },
        });
        return succeeded(fee, netAmount, user);
      });

      return result;
    },
    async withdrawFromBank(
      input: EconomyBankInput,
    ): Promise<EconomyOperationResult> {
      const { guildId, userId, amount, guard = {}, description } = input;
      const failure = validateAmount(amount, guard);
      const fee = resolveFee(amount, guard);
      if (failure || fee === null) {
        return failed(failure ?? "invalid_amount", fee ?? 0n);
      }
      const netAmount = amount - fee;

      const result = await prisma.$transaction(async (tx) => {
        if (
          await exceedsDailyCap(
            tx,
            guildId,
            userId,
            "toUserId",
            ["withdraw"],
            amount,
            guard.dailyCap,
          )
        ) {
          return failed("daily_cap_exceeded", fee, netAmount);
        }

        const updated = await tx.economyUser.updateMany({
          where: { guildId, userId, bankBalance: { gte: amount } },
          data: {
            balance: { increment: netAmount },
            bankBalance: { decrement: amount },
          },
        });
        if (updated.count !== 1) {
          return failed("insufficient_funds", fee, netAmount);
        }

        const ledger: Prisma.EconomyTransactionCreateManyInput[] = [
          {
            guildId,
            toUserId: userId,
            amount,
            type: "withdraw",
            description: description ?? null,
          },
        ];
        if (fee > 0n) {
          ledger.push({
            guildId,
            toUserId: userId,
            amount: fee,
            type: "withdraw_fee",
            description: "Withdrawal fee",
          });
        }
        await tx.economyTransaction.createMany({ data: ledger });

        const user = await tx.economyUser.findUniqueOrThrow({
          where: { guildId_userId: { guildId, userId } },
        });
        return succeeded(fee, netAmount, user);
      });

      return result;
    },
    async claimReward(
      guildId: string,
      userId: string,
      field: EconomyRewardField,
      now: Date,
      cooldownMs: number,
    ) {
      const cutoff = new Date(now.getTime() - cooldownMs);
      const result =
        field === "lastDailyAt"
          ? await prisma.economyUser.updateMany({
              where: {
                guildId,
                userId,
                OR: [{ lastDailyAt: null }, { lastDailyAt: { lte: cutoff } }],
              },
              data: { lastDailyAt: now },
            })
          : field === "lastWeeklyAt"
            ? await prisma.economyUser.updateMany({
                where: {
                  guildId,
                  userId,
                  OR: [
                    { lastWeeklyAt: null },
                    { lastWeeklyAt: { lte: cutoff } },
                  ],
                },
                data: { lastWeeklyAt: now },
              })
            : await prisma.economyUser.updateMany({
                where: {
                  guildId,
                  userId,
                  OR: [{ lastWorkAt: null }, { lastWorkAt: { lte: cutoff } }],
                },
                data: { lastWorkAt: now },
              });
      return result.count === 1;
    },
    async exportUserData(guildId: string, userId: string) {
      const [user, transactions] = await prisma.$transaction([
        prisma.economyUser.findUnique({
          where: { guildId_userId: { guildId, userId } },
        }),
        prisma.economyTransaction.findMany({
          where: {
            guildId,
            OR: [{ fromUserId: userId }, { toUserId: userId }],
          },
          orderBy: { createdAt: "asc" },
        }),
      ]);
      return { user, transactions };
    },
    async deleteUserData(guildId: string, userId: string) {
      const result = await prisma.$transaction(async (tx) => {
        const transactions = await tx.economyTransaction.count({
          where: {
            guildId,
            OR: [{ fromUserId: userId }, { toUserId: userId }],
          },
        });
        const users = await tx.economyUser.deleteMany({
          where: { guildId, userId },
        });
        await tx.economyTransaction.updateMany({
          where: { guildId, fromUserId: userId },
          data: { fromUserId: null },
        });
        await tx.economyTransaction.updateMany({
          where: { guildId, toUserId: userId },
          data: { toUserId: null },
        });
        return {
          deleted: users.count,
          anonymised: transactions,
          notes: [
            `economyUsers=${users.count}`,
            `economyTransactions=${transactions}`,
          ],
        };
      });
      return result;
    },
    count: (guildId: string) =>
      prisma.economyUser.count({ where: { guildId } }),
    leaderboard: (guildId: string, take: number, skip: number) =>
      prisma.economyUser.findMany({
        where: { guildId },
        orderBy: { balance: "desc" },
        take,
        skip,
      }),
  };
}
