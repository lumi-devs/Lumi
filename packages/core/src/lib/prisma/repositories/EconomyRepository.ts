import type { EconomyAccount, EconomyTransaction } from "@prisma/client";
import { Repository } from "#lib/prisma/repositories/Repository.js";

export interface EconomyMutationInput {
  guildId: string;
  userId: string;
  walletDelta: number;
  bankDelta: number;
  kind: string;
  reason?: string;
  startWallet: number;
  startBank: number;
}

export interface EconomyTransferInput {
  guildId: string;
  fromUserId: string;
  toUserId: string;
  amount: number;
  fee: number;
  reason?: string;
  startWallet: number;
  startBank: number;
}

export interface EconomySlotsInput {
  guildId: string;
  userId: string;
  bid: number;
  win: number;
  reason?: string;
  startWallet: number;
  startBank: number;
}

export interface EconomyPaydayInput {
  guildId: string;
  userId: string;
  amount: number;
  notBefore: Date;
  now: Date;
  startWallet: number;
  startBank: number;
}

/**
 * Persistent state owned by the `economy` module: per-guild wallet/bank
 * balances plus the append-only audit ledger. Every balance mutation runs
 * inside a single interactive transaction that also writes its ledger row,
 * and every debit is a guarded conditional update (`wallet >= amount` in the
 * `WHERE` clause) so concurrent mutations serialize on the row instead of
 * overdrawing it. Balances are deliberately never cached in Redis - a stale
 * read here is a double-spend.
 */
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

  /**
   * Applies a single-account wallet/bank delta and appends one ledger row in
   * the same transaction. Negative deltas fail with an `InsufficientFunds`
   * error (thrown as a plain `Error` with `code = "InsufficientFunds"`) when
   * the guarded update matches no row.
   */
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
          reason: input.reason,
          createdAt: new Date(),
        },
      });
      return { account, balanceAfter };
    });
  }

  /**
   * Moves `amount` wallet credits from one member to another, burning `fee`
   * credits. Writes the debit/credit ledger pair in the same transaction and
   * fails with `InsufficientFunds` when the sender cannot cover `amount`.
   */
  public async applyTransfer(
    input: EconomyTransferInput,
  ): Promise<{ from: EconomyAccount; to: EconomyAccount }> {
    const { guildId, fromUserId, toUserId } = input;
    await this.db.ensureGuild(guildId);
    return this.prisma.$transaction(async (tx) => {
      await tx.economyAccount.upsert({
        where: { guildId_userId: { guildId, userId: toUserId } },
        update: {},
        create: {
          guildId,
          userId: toUserId,
          wallet: input.startWallet,
          bank: input.startBank,
        },
      });
      await tx.economyAccount.upsert({
        where: { guildId_userId: { guildId, userId: fromUserId } },
        update: {},
        create: {
          guildId,
          userId: fromUserId,
          wallet: input.startWallet,
          bank: input.startBank,
        },
      });

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
            reason: input.reason,
            createdAt: now,
          },
          {
            guildId,
            userId: toUserId,
            kind: "transfer_in",
            amount: net,
            balanceAfter:
              (to as EconomyAccount).wallet + (to as EconomyAccount).bank,
            reason: input.reason,
            createdAt: now,
          },
        ],
      });
      return { from: from as EconomyAccount, to: to as EconomyAccount };
    });
  }

  /**
   * Settles one slot pull: deducts the bid, credits the win, and appends the
   * `slots_bid` row (always) plus the `slots_win` row (when `win > 0`) in one
   * transaction. The daily wagered total is derived from `slots_bid` rows, so
   * the gambling cap needs no extra state.
   */
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
          reason: input.reason,
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
            reason: input.reason,
            createdAt: now,
          },
        });
      }
      return { account, balanceAfter };
    });
  }

  /**
   * Claims a payday: credits `amount` and stamps `lastPaydayAt`, but only
   * when the previous claim is older than `notBefore`. Returns `null` when
   * the member is still on cooldown instead of throwing, so the caller can
   * report the retry time from the stored stamp.
   */
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
          reason: undefined,
          createdAt: input.now,
        },
      });
      return { account, balanceAfter };
    });
  }

  public listAccounts(guildId: string): Promise<EconomyAccount[]> {
    return this.prisma.economyAccount.findMany({ where: { guildId } });
  }

  public async sumKindsSince(
    guildId: string,
    userId: string,
    kinds: string[],
    since: Date,
  ): Promise<number> {
    const result = await this.prisma.economyTransaction.aggregate({
      _sum: { amount: true },
      where: { guildId, userId, kind: { in: kinds }, createdAt: { gte: since } },
    });
    return result._sum.amount ?? 0;
  }

  public findTransactionsForUser(
    userId: string,
  ): Promise<EconomyTransaction[]> {
    return this.prisma.economyTransaction.findMany({ where: { userId } });
  }

  public findAccountsForUser(userId: string): Promise<EconomyAccount[]> {
    return this.prisma.economyAccount.findMany({ where: { userId } });
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
}
