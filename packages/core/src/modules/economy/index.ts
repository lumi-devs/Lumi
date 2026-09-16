import { Module, DefineModule } from "#lib/module-system/Module.js";
import { cfg } from "#lib/module-system/config-schema.js";
import { defaultSlotPayoutEntries } from "./services/slots.js";
import { EconomyModuleName } from "./constants.js";

@DefineModule({
  name: EconomyModuleName,
  displayName: "Economy",
  emoji: "🪙",
  description:
    "Guild bank with wallet and vault balances, payday, taxed transfers, slots, and a fully audited transaction ledger.",
  short: "Guild currency with payday, transfers, slots, and an audit ledger.",
  endUserDataStatement:
    "Stores user ID with wallet and bank balances, payday timestamps, and a transaction history per server. Deleted on GDPR erasure.",
  category: "Community",
  configSchema: cfg.object({
    currency_name: cfg.string({
      label: "Currency Name",
      description: "Name of the server currency shown on balances.",
      default: "credits",
      group: "Currency",
    }),
    currency_emoji: cfg.string({
      label: "Currency Emoji",
      description: "Emoji shown next to currency amounts.",
      default: "🪙",
      group: "Currency",
    }),
    starting_wallet: cfg.number({
      label: "Starting Wallet",
      description: "Wallet balance granted to a member's first account.",
      default: 100,
      min: 0,
      max: 100000,
      group: "Currency",
    }),
    starting_bank: cfg.number({
      label: "Starting Bank",
      description: "Bank balance granted to a member's first account.",
      default: 0,
      min: 0,
      max: 100000,
      group: "Currency",
    }),
    max_balance: cfg.number({
      label: "Maximum Balance",
      description: "Wallet plus bank can never exceed this total.",
      default: 1000000,
      min: 1000,
      max: 2000000000,
      group: "Currency",
    }),
    payday_amount: cfg.number({
      label: "Payday Amount",
      description: "Currency granted by each payday claim.",
      default: 120,
      min: 1,
      max: 100000,
      group: "Payday",
    }),
    payday_cooldown: cfg.duration({
      label: "Payday Cooldown",
      description: "How long a member waits between payday claims.",
      default: "5m",
      quickPicks: ["1m", "5m", "15m", "1h", "24h"],
      group: "Payday",
    }),
    transfer_tax_percent: cfg.number({
      label: "Transfer Tax (%)",
      description: "Percentage burned on every member-to-member transfer.",
      default: 0,
      min: 0,
      max: 50,
      step: 1,
      group: "Transfers",
    }),
    slot_min_bid: cfg.number({
      label: "Slots Minimum Bid",
      description: "Smallest allowed slots bid.",
      default: 5,
      min: 1,
      max: 100000,
      group: "Slots",
    }),
    slot_max_bid: cfg.number({
      label: "Slots Maximum Bid",
      description: "Largest allowed slots bid.",
      default: 100,
      min: 1,
      max: 100000,
      group: "Slots",
    }),
    slot_cooldown: cfg.duration({
      label: "Slots Cooldown",
      description: "How long a member waits between slot pulls.",
      default: "5s",
      quickPicks: ["5s", "15s", "1m", "5m"],
      group: "Slots",
    }),
    slot_daily_cap: cfg.number({
      label: "Slots Daily Wager Cap",
      description:
        "Maximum total a member may wager on slots per day. 0 disables the cap.",
      default: 1000,
      min: 0,
      max: 1000000,
      group: "Slots",
    }),
    slot_payouts: cfg.stringList({
      label: "Slots Payouts",
      description:
        "Slot machine multipliers as key:multiplier entries (jackpot, cloverThree, cherriesThree, twoSix, cherriesTwo, threeKind, twoKind).",
      default: defaultSlotPayoutEntries(),
      group: "Slots",
    }),
  }),
})
export class EconomyModule extends Module {
  public override async deleteUserData(userId: string): Promise<void> {
    await this.container.db.economy.deleteForUser(userId);
  }

  public override async exportUserData(
    userId: string,
  ): Promise<Record<string, unknown> | null> {
    const [accounts, transactions] = await Promise.all([
      this.container.db.economy.findAccountsForUser(userId),
      this.container.db.economy.findTransactionsForUser(userId),
    ]);
    if (accounts.length === 0 && transactions.length === 0) return null;
    return { accounts, transactions };
  }
}
