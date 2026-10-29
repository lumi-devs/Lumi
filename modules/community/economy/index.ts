import { defineModule, type ModuleDefinition } from "@lumi/module-kit";
import { balanceDef } from "./commands/balance.js";
import { depositDef, withdrawDef } from "./commands/bank.js";
import { leaderboardDef } from "./commands/leaderboard.js";
import {
  dailyDef,
  weeklyDef,
  workDef,
} from "./commands/rewards.js";
import { buyDef, shopDef } from "./commands/shop.js";
import { transferDef } from "./commands/transfer.js";
import { EconomyConfigSchema } from "./config.js";
import { EconomyModuleName } from "./constants.js";

const economyModule: ModuleDefinition = defineModule({
  name: EconomyModuleName,
  displayName: "Economy",
  emoji: "💰",
  description: "Currency, banking, rewards, and shop",
  version: "2.0.0",
  config: EconomyConfigSchema,
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
