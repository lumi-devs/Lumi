import { logger } from "@lumi/foundation";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import type { Redis } from "ioredis";
import { Pool } from "pg";
import { createCacheFacade } from "./cache.js";
import type { DbContext } from "./context.js";
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

let defaultPool: Pool | null = null;
let defaultPrisma: PrismaClient | null = null;

export function getDatabasePool(): Pool {
  if (!defaultPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is not set.");
    }
    defaultPool = new Pool({ connectionString });
    defaultPool.on("error", (error) => {
      logger.error("postgres pool error", { error });
    });
  }
  return defaultPool;
}

export function getPrismaClient(): PrismaClient {
  if (!defaultPrisma) {
    const pool = getDatabasePool();
    const adapter = new PrismaPg(pool);
    defaultPrisma = new PrismaClient({ adapter });
  }
  return defaultPrisma;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    return Reflect.get(getPrismaClient(), prop);
  },
});

export async function connectDatabase(): Promise<void> {
  await getPrismaClient().$connect();
}

export async function disconnectDatabase(): Promise<void> {
  if (defaultPrisma) {
    try {
      await defaultPrisma.$disconnect();
    } catch (error) {
      logger.error("prisma disconnect failed", { error });
    }
  }
  if (defaultPool) {
    try {
      await defaultPool.end();
    } catch (error) {
      logger.error("postgres pool shutdown failed", { error });
    }
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
    roles: createRoleHelpers(ctx),
    security: createSecurityHelpers(ctx),
    verification: createVerificationHelpers(ctx),
    utility: createUtilityHelpers(ctx),
    moderation: createModerationHelpers(ctx),
    moduleData: createModuleDataHelpers(ctx),
  };
}

export type DbHelpers = ReturnType<typeof createDbHelpers>;

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
  ModerationCaseInput,
  ModerationCaseKind,
  ModerationCaseUpdate,
} from "./helpers/moderation.js";
export type {
  ModuleDataEntry,
  ModuleDataQuery,
  ModuleDataSetOptions,
} from "./helpers/moduleData.js";
export type { StatsSeriesPoint, StatsSnapshotCounts } from "./helpers/stats.js";
