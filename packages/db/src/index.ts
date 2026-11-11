import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import type { Redis } from "ioredis";
import { Pool } from "pg";
import { createCacheFacade } from "./cache.js";
import type { DbContext } from "./context.js";
import { createCustomCommandHelpers } from "./helpers/customCommands.js";
import { createEconomyHelpers } from "./helpers/economy.js";
import { createLevelingHelpers } from "./helpers/leveling.js";
import { createModerationHelpers } from "./helpers/moderation.js";
import { createModuleDataHelpers } from "./helpers/moduleData.js";
import { createRoleMenuHelpers } from "./helpers/roleMenus.js";
import { createRoleHelpers } from "./helpers/roles.js";
import { createSecurityHelpers } from "./helpers/security.js";
import { createStatsHelpers } from "./helpers/stats.js";
import { createTicketsHelpers } from "./helpers/tickets.js";
import { createUtilityHelpers } from "./helpers/utility.js";
import { createVerificationHelpers } from "./helpers/verification.js";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set.");
}

const pool = new Pool({ connectionString });

const adapter = new PrismaPg(pool);

export const prisma = new PrismaClient({ adapter });

export async function connectDatabase(): Promise<void> {
  await prisma.$connect();
}

export async function disconnectDatabase(): Promise<void> {
  try {
    await prisma.$disconnect();
  } catch (error) {
    console.error("prisma disconnect failed", { error });
  }
  try {
    await pool.end();
  } catch (error) {
    console.error("postgres pool shutdown failed", { error });
  }
}

export function createDbHelpers(redis?: Redis) {
  const ctx: DbContext = {
    prisma,
    cache: createCacheFacade(redis),
  };

  return {
    cache: ctx.cache,
    leveling: createLevelingHelpers(ctx),
    economy: createEconomyHelpers(ctx),
    stats: createStatsHelpers(ctx),
    tickets: createTicketsHelpers(ctx),
    roleMenus: createRoleMenuHelpers(ctx),
    customCommands: createCustomCommandHelpers(ctx),
    roles: createRoleHelpers(ctx),
    security: createSecurityHelpers(ctx),
    verification: createVerificationHelpers(ctx),
    utility: createUtilityHelpers(ctx),
    moderation: createModerationHelpers(ctx),
    moduleData: createModuleDataHelpers(ctx),
  };
}

export type DbHelpers = ReturnType<typeof createDbHelpers>;

export type { Prisma, PrismaClient } from "@prisma/client";
export type { CacheFacade } from "./cache.js";
export type { DbContext } from "./context.js";
export type {
  EconomyBalanceSnapshot,
  EconomyBankInput,
  EconomyCreditOptions,
  EconomyDebitOptions,
  EconomyFailureReason,
  EconomyGuard,
  EconomyOperationResult,
  EconomyRewardField,
  EconomyTransferInput,
  EconomyWalletLedger,
} from "./helpers/economy.js";
export type { LevelingXpInput } from "./helpers/leveling.js";
export type {
  ModuleDataEntry,
  ModuleDataQuery,
  ModuleDataSetOptions,
} from "./helpers/moduleData.js";
export type {
  ModerationCaseInput,
  ModerationCaseKind,
  ModerationCaseUpdate,
} from "./helpers/moderation.js";
export type { StatsSeriesPoint, StatsSnapshotCounts } from "./helpers/stats.js";
