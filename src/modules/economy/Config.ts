import type { Container } from "#src/lib/Services.js";
import { parseDuration } from "#src/lib/utilities/Time.js";
import {
  defaultSlotPayoutEntries,
  parseSlotPayouts,
  type SlotPayoutKey,
} from "#src/modules/economy/services/Slots.js";
import { EconomyModuleName } from "#src/modules/economy/Constants.js";

export interface EconomyConfig {
  currencyName: string;
  currencyEmoji: string;
  startingWallet: number;
  startingBank: number;
  maxBalance: number;
  paydayAmount: number;
  paydayCooldownMs: number;
  transferTaxPercent: number;
  slotMinBid: number;
  slotMaxBid: number;
  slotCooldownMs: number;
  slotDailyCap: number;
  slotPayouts: Record<SlotPayoutKey, number>;
}

const EconomyDefaults: EconomyConfig = {
  currencyName: "credits",
  currencyEmoji: "🪙",
  startingWallet: 100,
  startingBank: 0,
  maxBalance: 1000000,
  paydayAmount: 120,
  paydayCooldownMs: 5 * 60 * 1000,
  transferTaxPercent: 0,
  slotMinBid: 5,
  slotMaxBid: 100,
  slotCooldownMs: 5000,
  slotDailyCap: 1000,
  slotPayouts: parseSlotPayouts(defaultSlotPayoutEntries()),
};

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function asDurationMs(value: unknown, fallback: number): number {
  if (typeof value !== "string") return fallback;
  return parseDuration(value) ?? fallback;
}

function floorAt(value: unknown, fallback: number, min: number): number {
  return Math.max(min, Math.floor(asNumber(value, fallback)));
}

export async function getEconomyConfig(
  services: Container,
  guildId: string,
): Promise<EconomyConfig> {
  const get = (key: string) =>
    services.db.config.getModuleConfig(guildId, EconomyModuleName, key);
  const [
    currencyName,
    currencyEmoji,
    startingWallet,
    startingBank,
    maxBalance,
    paydayAmount,
    paydayCooldown,
    transferTaxPercent,
    slotMinBid,
    slotMaxBid,
    slotCooldown,
    slotDailyCap,
    slotPayouts,
  ] = await Promise.all([
    get("currency_name"),
    get("currency_emoji"),
    get("starting_wallet"),
    get("starting_bank"),
    get("max_balance"),
    get("payday_amount"),
    get("payday_cooldown"),
    get("transfer_tax_percent"),
    get("slot_min_bid"),
    get("slot_max_bid"),
    get("slot_cooldown"),
    get("slot_daily_cap"),
    get("slot_payouts"),
  ]);

  return {
    currencyName: asString(currencyName, EconomyDefaults.currencyName),
    currencyEmoji: asString(currencyEmoji, EconomyDefaults.currencyEmoji),
    startingWallet: floorAt(startingWallet, EconomyDefaults.startingWallet, 0),
    startingBank: floorAt(startingBank, EconomyDefaults.startingBank, 0),
    maxBalance: floorAt(maxBalance, EconomyDefaults.maxBalance, 1000),
    paydayAmount: floorAt(paydayAmount, EconomyDefaults.paydayAmount, 1),
    paydayCooldownMs: Math.max(
      1000,
      asDurationMs(paydayCooldown, EconomyDefaults.paydayCooldownMs),
    ),
    transferTaxPercent: Math.min(
      50,
      Math.max(
        0,
        asNumber(transferTaxPercent, EconomyDefaults.transferTaxPercent),
      ),
    ),
    slotMinBid: floorAt(slotMinBid, EconomyDefaults.slotMinBid, 1),
    slotMaxBid: floorAt(slotMaxBid, EconomyDefaults.slotMaxBid, 1),
    slotCooldownMs: Math.max(
      0,
      asDurationMs(slotCooldown, EconomyDefaults.slotCooldownMs),
    ),
    slotDailyCap: floorAt(slotDailyCap, EconomyDefaults.slotDailyCap, 0),
    slotPayouts: parseSlotPayouts(
      Array.isArray(slotPayouts)
        ? slotPayouts
        : defaultSlotPayoutEntries(),
    ),
  };
}

export function formatAmount(config: EconomyConfig, amount: number): string {
  return `${config.currencyEmoji} ${amount.toLocaleString("en-US")} ${config.currencyName}`;
}
