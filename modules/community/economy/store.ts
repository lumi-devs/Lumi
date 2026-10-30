import type { ModuleServices } from "@lumi/module-kit";
import type { EconomyConfig } from "./config.js";

interface TransactionInput {
  guildId: string;
  fromUserId?: string;
  toUserId?: string;
  amount: bigint;
  type: string;
  description?: string;
}

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

export async function recordTransaction(
  services: ModuleServices,
  input: TransactionInput,
): Promise<void> {
  await services.db.prisma.economyTransaction.create({ data: input });
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

  return services.db.prisma.economyUser.upsert({
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
  });
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

  const earned = amount > 0n ? amount : 0n;
  const spent = amount < 0n ? -amount : 0n;

  await services.db.prisma.economyUser.upsert({
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

  await recordTransaction(services, {
    guildId,
    toUserId: amount > 0n ? userId : undefined,
    fromUserId: amount < 0n ? userId : undefined,
    amount: earned > 0n ? earned : spent,
    type,
    description,
  });
}

interface WalletOptions {
  trackSpent?: boolean;
  trackEarned?: boolean;
}

export async function debitWallet(
  services: ModuleServices,
  guildId: string,
  userId: string,
  amount: bigint,
  options: WalletOptions = {},
): Promise<boolean> {
  if (amount <= 0n) return false;

  const result = await services.db.prisma.economyUser.updateMany({
    where: { guildId, userId, balance: { gte: amount } },
    data: {
      balance: { decrement: amount },
      ...(options.trackSpent ?? true
        ? { totalSpent: { increment: amount } }
        : {}),
    },
  });
  return result.count === 1;
}

export async function creditWallet(
  services: ModuleServices,
  guildId: string,
  userId: string,
  amount: bigint,
  options: WalletOptions = {},
): Promise<void> {
  if (amount <= 0n) return;

  const earned = options.trackEarned ?? true;
  await services.db.prisma.economyUser.upsert({
    where: { guildId_userId: { guildId, userId } },
    update: {
      balance: { increment: amount },
      ...(earned ? { totalEarned: { increment: amount } } : {}),
    },
    create: {
      guildId,
      userId,
      balance: amount,
      bankBalance: 0n,
      totalEarned: earned ? amount : 0n,
      totalSpent: 0n,
    },
  });
}

export async function refundWallet(
  services: ModuleServices,
  guildId: string,
  userId: string,
  amount: bigint,
): Promise<void> {
  if (amount <= 0n) return;

  await services.db.prisma.economyUser.update({
    where: { guildId_userId: { guildId, userId } },
    data: {
      balance: { increment: amount },
      totalSpent: { decrement: amount },
    },
  });
  await recordTransaction(services, {
    guildId,
    toUserId: userId,
    amount,
    type: "shop_refund",
    description: "Refunded failed shop purchase",
  });
}

export async function depositToBank(
  services: ModuleServices,
  guildId: string,
  userId: string,
  amount: bigint,
): Promise<boolean> {
  const result = await services.db.prisma.economyUser.updateMany({
    where: { guildId, userId, balance: { gte: amount } },
    data: {
      balance: { decrement: amount },
      bankBalance: { increment: amount },
    },
  });
  return result.count === 1;
}

export async function withdrawFromBank(
  services: ModuleServices,
  guildId: string,
  userId: string,
  amount: bigint,
): Promise<boolean> {
  const result = await services.db.prisma.economyUser.updateMany({
    where: { guildId, userId, bankBalance: { gte: amount } },
    data: {
      balance: { increment: amount },
      bankBalance: { decrement: amount },
    },
  });
  return result.count === 1;
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
  const cutoff = new Date(now.getTime() - cooldownMs);
  const result = await services.db.prisma.economyUser.updateMany({
    where: {
      guildId,
      userId,
      OR: [{ [field]: null }, { [field]: { lte: cutoff } }],
    },
    data: { [field]: now },
  });
  return result.count === 1;
}
