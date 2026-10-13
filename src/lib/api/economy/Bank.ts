import type { Container } from "#src/lib/Services.js";
import {
  BankService,
  InvalidAmountError,
  type LeaderboardEntry,
} from "#src/modules/economy/services/BankService.js";
import { getEconomyConfig } from "#src/modules/economy/Config.js";
import { EconomyModuleName } from "#src/modules/economy/Constants.js";

export type { LeaderboardEntry };

export interface BankBalance {
  wallet: number;
  bank: number;
  total: number;
  lastPaydayAt: Date | null;
}

export interface BankAccountView {
  name: string;
  balance: number;
}

export class AbortPurchase extends Error {
  public constructor(message = "Purchase aborted.") {
    super(message);
    this.name = "AbortPurchase";
  }
}

function service(services: Container): BankService {
  return new BankService(services.db.economy);
}

export async function getBalance(
  services: Container,
  guildId: string,
  userId: string,
): Promise<BankBalance> {
  return service(services).getBalance(guildId, userId, await getEconomyConfig(services, guildId));
}

export async function account(
  services: Container,
  guildId: string,
  userId: string,
): Promise<BankAccountView> {
  const config = await getEconomyConfig(services, guildId);
  const record = await services.db.economy.ensureAccount(
    guildId,
    userId,
    config.startingWallet,
    config.startingBank,
  );
  return {
    name: await getBankName(services, guildId),
    balance: record.wallet + record.bank,
  };
}

export async function currencyName(services: Container, guildId: string): Promise<string> {
  return getCurrencyName(services, guildId);
}

export async function bankName(services: Container, guildId: string): Promise<string> {
  return getBankName(services, guildId);
}

export async function deposit(
  services: Container,
  guildId: string,
  userId: string,
  amount: number,
): Promise<BankBalance> {
  return service(services).deposit(guildId, userId, amount, await getEconomyConfig(services, guildId));
}

export async function withdraw(
  services: Container,
  guildId: string,
  userId: string,
  amount: number,
): Promise<BankBalance> {
  return service(services).withdraw(guildId, userId, amount, await getEconomyConfig(services, guildId));
}

export async function transfer(
  services: Container,
  guildId: string,
  fromUserId: string,
  toUserId: string,
  amount: number,
): Promise<{ sent: number; fee: number; received: number }> {
  return service(services).transfer(guildId, fromUserId, toUserId, amount, await getEconomyConfig(services, guildId));
}

export async function withCost<T>(
  services: Container,
  guildId: string,
  userId: string,
  amount: number,
  run: () => Promise<T>,
): Promise<T> {
  const svc = service(services);
  const config = await getEconomyConfig(services, guildId);
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new InvalidAmountError("Amount must be a positive whole number.");
  }
  await svc.withdraw(guildId, userId, amount, config);
  try {
    return await run();
  } catch (err) {
    try {
      await svc.deposit(guildId, userId, amount, config);
    } catch (refundErr) {
      services.logger.error("[Bank.withCost] refund failed", refundErr);
      throw refundErr;
    }
    if (err instanceof AbortPurchase) return undefined as T;
    throw err;
  }
}

export async function bankPrune(
  services: Container,
  guildId?: string,
  userId?: string,
): Promise<number> {
  return services.db.economy.pruneZeroBalances(guildId, userId);
}

export function cost(amount: number) {
  return async <T>(
    services: Container,
    guildId: string,
    userId: string,
    run: () => Promise<T>,
  ): Promise<T> => withCost(services, guildId, userId, amount, run);
}

export async function getCurrencyName(services: Container, guildId: string): Promise<string> {
  return (await getEconomyConfig(services, guildId)).currencyName;
}

export async function getBankName(services: Container, guildId: string): Promise<string> {
  const stored = await services.db.config.getModuleConfig(guildId, EconomyModuleName, "bank_name");
  return typeof stored === "string" && stored.length > 0 ? stored : "Bank";
}

export async function getLeaderboard(
  services: Container,
  guildId: string,
  limit = 10,
): Promise<{ entries: LeaderboardEntry[]; total: number }> {
  return service(services).leaderboard(guildId, limit);
}

export async function getLeaderboardPosition(
  services: Container,
  guildId: string,
  userId: string,
): Promise<number | null> {
  return service(services).rankOf(guildId, userId);
}
