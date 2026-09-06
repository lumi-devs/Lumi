import { container } from "@sapphire/framework";
import type { EconomyAccount } from "@prisma/client";
import type { EconomyRepository } from "#lib/prisma/repositories/EconomyRepository.js";
import {
  resolveSlotPayout,
  spinSlots,
  type SlotSpin,
} from "../lib/slots.js";
import type { EconomyConfig } from "../index.js";

export class EconomyError extends Error {
  public readonly code: string;

  public constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export class InsufficientFundsError extends EconomyError {
  public constructor(balance: number) {
    super(
      "InsufficientFunds",
      `Insufficient funds (available: ${balance.toLocaleString("en-US")}).`,
    );
  }
}

export class CooldownError extends EconomyError {
  public readonly retryAfterMs: number;

  public constructor(retryAfterMs: number, message: string) {
    super("Cooldown", message);
    this.retryAfterMs = retryAfterMs;
  }
}

export class EconomyLimitError extends EconomyError {
  public constructor(message: string) {
    super("LimitExceeded", message);
  }
}

export class InvalidAmountError extends EconomyError {
  public constructor(message: string) {
    super("InvalidAmount", message);
  }
}

function isRepoInsufficient(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err as Error & { code?: string }).code === "InsufficientFunds"
  );
}

export interface BalanceView {
  wallet: number;
  bank: number;
  total: number;
  lastPaydayAt: Date | null;
}

export interface SlotsResult {
  spin: SlotSpin;
  bid: number;
  pay: number;
  net: number;
  won: boolean;
  payoutKey: string | null;
  multiplier: number;
  balanceAfter: number;
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  wallet: number;
  bank: number;
  total: number;
}

function toBalance(account: EconomyAccount): BalanceView {
  return {
    wallet: account.wallet,
    bank: account.bank,
    total: account.wallet + account.bank,
    lastPaydayAt: account.lastPaydayAt,
  };
}

function assertPositiveInteger(amount: number): void {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new InvalidAmountError("Amount must be a positive whole number.");
  }
}

/**
 * Domain service for the guild-scoped economy. Commands resolve the guild's
 * {@linkcode EconomyConfig} and call one method per action; every balance
 * mutation funnels into `EconomyRepository`, which applies it together with
 * its ledger row inside a single database transaction.
 */
export class BankService {
  public constructor(
    private readonly store: EconomyRepository = container.db.economy,
  ) {}

  public async getBalance(
    guildId: string,
    userId: string,
    config: EconomyConfig,
  ): Promise<BalanceView> {
    const account = await this.store.ensureAccount(
      guildId,
      userId,
      config.startingWallet,
      config.startingBank,
    );
    return toBalance(account);
  }

  public async deposit(
    guildId: string,
    userId: string,
    amount: number,
    config: EconomyConfig,
  ): Promise<BalanceView> {
    assertPositiveInteger(amount);
    try {
      const { account } = await this.store.applyMutation({
        guildId,
        userId,
        walletDelta: -amount,
        bankDelta: amount,
        kind: "deposit",
        reason: `deposit ${amount}`,
        startWallet: config.startingWallet,
        startBank: config.startingBank,
      });
      return toBalance(account);
    } catch (err) {
      if (isRepoInsufficient(err)) {
        const balance = await this.getBalance(guildId, userId, config);
        throw new InsufficientFundsError(balance.wallet);
      }
      throw err;
    }
  }

  public async withdraw(
    guildId: string,
    userId: string,
    amount: number,
    config: EconomyConfig,
  ): Promise<BalanceView> {
    assertPositiveInteger(amount);
    try {
      const { account } = await this.store.applyMutation({
        guildId,
        userId,
        walletDelta: amount,
        bankDelta: -amount,
        kind: "withdraw",
        reason: `withdraw ${amount}`,
        startWallet: config.startingWallet,
        startBank: config.startingBank,
      });
      return toBalance(account);
    } catch (err) {
      if (isRepoInsufficient(err)) {
        const balance = await this.getBalance(guildId, userId, config);
        throw new InsufficientFundsError(balance.bank);
      }
      throw err;
    }
  }

  public async transfer(
    guildId: string,
    fromUserId: string,
    toUserId: string,
    amount: number,
    config: EconomyConfig,
  ): Promise<{ sent: number; fee: number; received: number }> {
    assertPositiveInteger(amount);
    if (fromUserId === toUserId) {
      throw new InvalidAmountError("You cannot transfer currency to yourself.");
    }
    const fee = Math.floor((amount * config.transferTaxPercent) / 100);
    const received = amount - fee;
    if (received <= 0) {
      throw new InvalidAmountError(
        "Transfer amount is entirely consumed by the transfer tax.",
      );
    }
    try {
      await this.store.applyTransfer({
        guildId,
        fromUserId,
        toUserId,
        amount,
        fee,
        reason:
          fee > 0
            ? `transfer ${amount} (tax ${fee} burned)`
            : `transfer ${amount}`,
        startWallet: config.startingWallet,
        startBank: config.startingBank,
      });
      return { sent: amount, fee, received };
    } catch (err) {
      if (isRepoInsufficient(err)) {
        const balance = await this.getBalance(guildId, fromUserId, config);
        throw new InsufficientFundsError(balance.wallet);
      }
      throw err;
    }
  }

  public async payday(
    guildId: string,
    userId: string,
    config: EconomyConfig,
    now: Date = new Date(),
  ): Promise<{ balance: BalanceView; amount: number; capped: boolean }> {
    const existing = await this.store.findAccount(guildId, userId);
    if (
      existing?.lastPaydayAt &&
      now.getTime() - existing.lastPaydayAt.getTime() < config.paydayCooldownMs
    ) {
      const retryAfterMs =
        config.paydayCooldownMs -
        (now.getTime() - existing.lastPaydayAt.getTime());
      throw new CooldownError(
        retryAfterMs,
        "Payday is on cooldown. Try again later.",
      );
    }
    const currentTotal =
      (existing?.wallet ?? config.startingWallet) +
      (existing?.bank ?? config.startingBank);
    const headroom = Math.max(0, config.maxBalance - currentTotal);
    if (headroom <= 0) {
      throw new EconomyLimitError(
        "Balance is already at the server maximum.",
      );
    }
    const amount = Math.min(config.paydayAmount, headroom);
    const claimed = await this.store.claimPayday({
      guildId,
      userId,
      amount,
      notBefore: new Date(now.getTime() - config.paydayCooldownMs),
      now,
      startWallet: config.startingWallet,
      startBank: config.startingBank,
    });
    if (!claimed) {
      const retryAfterMs = await this.paydayRetryAfterMs(
        guildId,
        userId,
        config,
        now,
      );
      throw new CooldownError(
        retryAfterMs,
        "Payday is on cooldown. Try again later.",
      );
    }
    return {
      balance: toBalance(claimed.account),
      amount,
      capped: amount < config.paydayAmount,
    };
  }

  private async paydayRetryAfterMs(
    guildId: string,
    userId: string,
    config: EconomyConfig,
    now: Date,
  ): Promise<number> {
    const account = await this.store.findAccount(guildId, userId);
    if (!account?.lastPaydayAt) return 0;
    return Math.max(
      0,
      config.paydayCooldownMs - (now.getTime() - account.lastPaydayAt.getTime()),
    );
  }

  public async adjust(
    guildId: string,
    userId: string,
    operation: "add" | "remove" | "set",
    amount: number,
    vault: "wallet" | "bank",
    reason: string,
    actorId: string,
    config: EconomyConfig,
  ): Promise<BalanceView> {
    if (!Number.isInteger(amount) || amount < 0) {
      throw new InvalidAmountError("Amount must be a non-negative whole number.");
    }
    if (operation !== "set") assertPositiveInteger(amount);
    const account = await this.store.ensureAccount(
      guildId,
      userId,
      config.startingWallet,
      config.startingBank,
    );
    const current = vault === "wallet" ? account.wallet : account.bank;
    let walletDelta = 0;
    let bankDelta = 0;
    let kind: string;
    if (operation === "add") {
      const headroom = Math.max(
        0,
        config.maxBalance - (account.wallet + account.bank),
      );
      const credit = Math.min(amount, headroom);
      if (credit <= 0) {
        throw new EconomyLimitError(
          "Balance is already at the server maximum.",
        );
      }
      if (vault === "wallet") walletDelta = credit;
      else bankDelta = credit;
      kind = "admin_add";
    } else if (operation === "remove") {
      if (vault === "wallet") walletDelta = -Math.min(amount, current);
      else bankDelta = -Math.min(amount, current);
      kind = "admin_remove";
    } else {
      const clamped = Math.min(
        amount,
        config.maxBalance - (vault === "wallet" ? account.bank : account.wallet),
      );
      if (clamped < 0) {
        throw new EconomyLimitError(
          "Amount exceeds the server maximum balance.",
        );
      }
      if (vault === "wallet") walletDelta = clamped - current;
      else bankDelta = clamped - current;
      kind = "admin_set";
    }
    const { account: updated } = await this.store.applyMutation({
      guildId,
      userId,
      walletDelta,
      bankDelta,
      kind,
      reason: `by ${actorId}: ${reason}`.slice(0, 500),
      startWallet: config.startingWallet,
      startBank: config.startingBank,
    });
    return toBalance(updated);
  }

  public async playSlots(
    guildId: string,
    userId: string,
    bid: number,
    config: EconomyConfig,
    random: () => number = Math.random,
    now: Date = new Date(),
  ): Promise<SlotsResult> {
    if (!Number.isInteger(bid)) {
      throw new InvalidAmountError("Bid must be a whole number.");
    }
    if (bid < config.slotMinBid || bid > config.slotMaxBid) {
      throw new InvalidAmountError(
        `Bid must be between ${config.slotMinBid} and ${config.slotMaxBid}.`,
      );
    }
    if (config.slotDailyCap > 0) {
      const dayStart = new Date(now);
      dayStart.setUTCHours(0, 0, 0, 0);
      const wagered = -(await this.store.sumKindsSince(
        guildId,
        userId,
        ["slots_bid"],
        dayStart,
      ));
      if (wagered + bid > config.slotDailyCap) {
        throw new EconomyLimitError(
          `Daily slots cap reached (${config.slotDailyCap.toLocaleString("en-US")} wagered per day).`,
        );
      }
    }
    const spin = spinSlots(random);
    const outcome = resolveSlotPayout(spin.middle, bid, config.slotPayouts);
    try {
      const { balanceAfter } = await this.store.recordSlots({
        guildId,
        userId,
        bid,
        win: outcome.pay,
        reason: `slots bid ${bid} won ${outcome.pay}`,
        startWallet: config.startingWallet,
        startBank: config.startingBank,
      });
      return {
        spin,
        bid,
        pay: outcome.pay,
        net: outcome.pay - bid,
        won: outcome.pay > 0,
        payoutKey: outcome.key,
        multiplier: outcome.multiplier,
        balanceAfter,
      };
    } catch (err) {
      if (isRepoInsufficient(err)) {
        const balance = await this.getBalance(guildId, userId, config);
        throw new InsufficientFundsError(balance.wallet);
      }
      throw err;
    }
  }

  public async leaderboard(
    guildId: string,
    limit: number,
    offset = 0,
  ): Promise<{ entries: LeaderboardEntry[]; total: number }> {
    const safeLimit = Math.min(100, Math.max(1, Math.floor(limit)));
    const safeOffset = Math.max(0, Math.floor(offset));
    const accounts = await this.store.listAccounts(guildId);
    const ranked = accounts
      .map((account) => ({
        userId: account.userId,
        wallet: account.wallet,
        bank: account.bank,
        total: account.wallet + account.bank,
      }))
      .sort((a, b) => b.total - a.total || (a.userId < b.userId ? -1 : 1));
    return {
      entries: ranked
        .slice(safeOffset, safeOffset + safeLimit)
        .map((entry, i) => ({ ...entry, rank: safeOffset + i + 1 })),
      total: ranked.length,
    };
  }
}
