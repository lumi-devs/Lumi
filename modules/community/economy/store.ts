import type {
  EconomyGuard,
  EconomyOperationResult,
  ModuleServices,
} from "@lumi/module-kit";
import type { EconomyConfig } from "./config.js";

export interface EconomyUser {
  guildId: string;
  userId: string;
  balance: bigint;
  bankBalance: bigint;
  totalEarned: bigint;
  totalSpent: bigint;
  lastDailyAt: Date | null;
  lastWeeklyAt: Date | null;
  lastWorkAt: Date | null;
}

export async function getOrCreateUser(
  services: ModuleServices,
  guildId: string,
  userId: string,
  config: EconomyConfig,
): Promise<EconomyUser> {
  const startingBalance = Number.isFinite(config.startingBalance)
    ? BigInt(Math.max(0, Math.trunc(config.startingBalance)))
    : 0n;

  return services.helpers.economy.getOrCreate(guildId, userId, startingBalance);
}

export async function addBalance(
  services: ModuleServices,
  guildId: string,
  userId: string,
  amount: bigint,
  type: string,
  description?: string,
): Promise<void> {
  if (amount === 0n) return;

  await services.helpers.economy.addBalance(guildId, userId, amount, {
    type,
    description,
  });
}

interface WalletOptions {
  trackSpent?: boolean;
  trackEarned?: boolean;
  type?: string;
  description?: string;
}

export async function debitWallet(
  services: ModuleServices,
  guildId: string,
  userId: string,
  amount: bigint,
  options: WalletOptions = {},
): Promise<boolean> {
  return services.helpers.economy.debit(guildId, userId, amount, {
    trackSpent: options.trackSpent ?? true,
    ledger: options.type
      ? { type: options.type, description: options.description }
      : undefined,
  });
}

export async function creditWallet(
  services: ModuleServices,
  guildId: string,
  userId: string,
  amount: bigint,
  options: WalletOptions = {},
): Promise<void> {
  await services.helpers.economy.credit(guildId, userId, amount, {
    trackEarned: options.trackEarned ?? true,
    ledger: options.type
      ? { type: options.type, description: options.description }
      : undefined,
  });
}

export async function refundWallet(
  services: ModuleServices,
  guildId: string,
  userId: string,
  amount: bigint,
): Promise<void> {
  if (amount <= 0n) return;

  await services.helpers.economy.refund(guildId, userId, amount, {
    type: "shop_refund",
    description: "Refunded failed shop purchase",
  });
}

export async function depositToBank(
  services: ModuleServices,
  guildId: string,
  userId: string,
  amount: bigint,
  guard?: EconomyGuard,
): Promise<EconomyOperationResult> {
  return services.helpers.economy.depositToBank({
    guildId,
    userId,
    amount,
    guard,
  });
}

export async function withdrawFromBank(
  services: ModuleServices,
  guildId: string,
  userId: string,
  amount: bigint,
  guard?: EconomyGuard,
): Promise<EconomyOperationResult> {
  return services.helpers.economy.withdrawFromBank({
    guildId,
    userId,
    amount,
    guard,
  });
}

export type RewardField = "lastDailyAt" | "lastWeeklyAt" | "lastWorkAt";

export async function claimReward(
  services: ModuleServices,
  guildId: string,
  userId: string,
  field: RewardField,
  cooldownMs: number,
  now: Date = new Date(),
): Promise<boolean> {
  return services.helpers.economy.claimReward(
    guildId,
    userId,
    field,
    now,
    cooldownMs,
  );
}
