import { defineModule, type ModuleDefinition } from "@lumi/module-kit";
import { EconomyConfigSchema } from "./config.js";
import { EconomyModuleName } from "./constants.js";
import { balanceDef } from "./commands/balance.js";
import {
  dailyDef,
  weeklyDef,
  workDef,
} from "./commands/rewards.js";
import { depositDef, withdrawDef } from "./commands/bank.js";
import { transferDef } from "./commands/transfer.js";
import { leaderboardDef } from "./commands/leaderboard.js";
import { buyDef, shopDef } from "./commands/shop.js";

const economyModule: ModuleDefinition = defineModule({
  name: EconomyModuleName,
  displayName: "Economy",
  emoji: "💰",
  description: "Currency, banking, rewards, and shop",
  version: "2.0.0",
  config: EconomyConfigSchema,
  configFields: [
    {
      key: "currencyName",
      label: "Currency Name",
      type: "string",
      description: "Name of the currency",
    },
    {
      key: "currencySymbol",
      label: "Currency Symbol",
      type: "string",
      description: "Emoji or symbol",
    },
    {
      key: "startingBalance",
      label: "Starting Balance",
      type: "number",
      description: "Initial balance for new users",
    },
    {
      key: "dailyAmount",
      label: "Daily Reward",
      type: "number",
      description: "Amount for /daily",
    },
    {
      key: "weeklyAmount",
      label: "Weekly Reward",
      type: "number",
      description: "Amount for /weekly",
    },
    {
      key: "taxRate",
      label: "Transaction Tax",
      type: "number",
      description: "Tax on transfers (0.05 = 5%)",
    },
    {
      key: "workCooldown",
      label: "Work Cooldown (seconds)",
      type: "number",
      description: "Seconds between /work",
    },
    {
      key: "workMinPay",
      label: "Work Min Pay",
      type: "number",
      description: "Minimum /work payout",
    },
    {
      key: "workMaxPay",
      label: "Work Max Pay",
      type: "number",
      description: "Maximum /work payout",
    },
  ],
  commands: [
    balanceDef,
    dailyDef,
    weeklyDef,
    workDef,
    transferDef,
    depositDef,
    withdrawDef,
    leaderboardDef,
    shopDef,
    buyDef,
  ],
  listeners: [],
  tasks: [],
  async onLoad(_services) {
    console.log("[economy] Module loaded");
    return [];
  },
  async onUnload(_services) {
    console.log("[economy] Module unloaded");
  },
});

export default economyModule;
