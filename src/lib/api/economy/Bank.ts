import type { Container } from "#src/lib/Services.js";
import {
  BankService,
  EconomyError,
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

export function isGlobal(): boolean {
  return false;
}

export function setGlobal(_global: boolean): never {
  throw new EconomyError("Unsupported", "The bank is guild-scoped; global mode is not supported.");
}

export async function getBalance(
  services: Container,
  guildId: string,
  userId: string,
): Promise<BankBalance> {
  return service(services).getBalance(guildId, userId, await getEconomyConfig(services, guildId));
}

export async function getAccount(
  services: Container,
  guildId: string,
  userId: string,
): Promise<BankBalance> {
  return getBalance(services, guildId, userId);
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

export async function canSpend(
  services: Container,
  guildId: string,
  userId: string,
  amount: number,
): Promise<boolean> {
  const balance = await getBalance(services, guildId, userId);
  return balance.total >= amount;
}

export async function setBalance(
  services: Container,
  guildId: string,
  userId: string,
  amount: number,
  actorId: string,
): Promise<BankBalance> {
  const config = await getEconomyConfig(services, guildId);
  return service(services).adjust(guildId, userId, "set", amount, "wallet", `set balance ${amount}`, actorId, config);
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
  await svc.withdraw(guildId, userId, amount, config);
  try {
    return await run();
  } catch (err) {
    await svc.deposit(guildId, userId, amount, config).catch(() => undefined);
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

export async function wipeBank(
  services: Container,
  guildId: string,
): Promise<number> {
  return services.db.economy.wipeGuild(guildId);
}

export async function getCurrencyName(services: Container, guildId: string): Promise<string> {
  return (await getEconomyConfig(services, guildId)).currencyName;
}

export async function setCurrencyName(services: Container, guildId: string, name: string): Promise<void> {
  await services.db.config.setModuleConfig(guildId, EconomyModuleName, "currency_name", name);
}

export async function getBankName(services: Container, guildId: string): Promise<string> {
  const stored = await services.db.config.getModuleConfig(guildId, EconomyModuleName, "bank_name");
  return typeof stored === "string" && stored.length > 0 ? stored : "Bank";
}

export async function setBankName(services: Container, guildId: string, name: string): Promise<void> {
  await services.db.config.setModuleConfig(guildId, EconomyModuleName, "bank_name", name);
}

export async function getMaxBalance(services: Container, guildId: string): Promise<number> {
  return (await getEconomyConfig(services, guildId)).maxBalance;
}

export async function setMaxBalance(services: Container, guildId: string, amount: number): Promise<void> {
  await services.db.config.setModuleConfig(guildId, EconomyModuleName, "max_balance", amount);
}

export async function getDefaultBalance(services: Container, guildId: string): Promise<number> {
  return (await getEconomyConfig(services, guildId)).startingWallet;
}

export async function setDefaultBalance(services: Container, guildId: string, amount: number): Promise<void> {
  await services.db.config.setModuleConfig(guildId, EconomyModuleName, "starting_wallet", amount);
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
