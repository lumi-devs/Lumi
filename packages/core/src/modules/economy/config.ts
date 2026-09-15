import { container } from "@sapphire/framework";
import { parseDuration } from "#lib/utilities/time.js";
import {
  defaultSlotPayoutEntries,
  parseSlotPayouts,
  type SlotPayoutKey,
} from "./lib/slots.js";
import { EconomyModuleName } from "./constants.js";

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

export async function getEconomyConfig(
  guildId: string,
): Promise<EconomyConfig> {
  const get = (key: string) =>
    container.db.config.getModuleConfig(guildId, EconomyModuleName, key);
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
    startingWallet: Math.max(
      0,
      Math.floor(asNumber(startingWallet, EconomyDefaults.startingWallet)),
    ),
    startingBank: Math.max(
      0,
      Math.floor(asNumber(startingBank, EconomyDefaults.startingBank)),
    ),
    maxBalance: Math.max(
      1000,
      Math.floor(asNumber(maxBalance, EconomyDefaults.maxBalance)),
    ),
    paydayAmount: Math.max(
      1,
      Math.floor(asNumber(paydayAmount, EconomyDefaults.paydayAmount)),
    ),
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
    slotMinBid: Math.max(
      1,
      Math.floor(asNumber(slotMinBid, EconomyDefaults.slotMinBid)),
    ),
    slotMaxBid: Math.max(
      1,
      Math.floor(asNumber(slotMaxBid, EconomyDefaults.slotMaxBid)),
    ),
    slotCooldownMs: Math.max(
      0,
      asDurationMs(slotCooldown, EconomyDefaults.slotCooldownMs),
    ),
    slotDailyCap: Math.max(
      0,
      Math.floor(asNumber(slotDailyCap, EconomyDefaults.slotDailyCap)),
    ),
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
