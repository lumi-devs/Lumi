import type { PrismaClient } from "@lumi/db";
import type { AddonManager } from "@lumi/downloader";
import type { ModuleLoader } from "@lumi/module-runtime";
import type { PermitRepository } from "@lumi/permits";
import type { Client } from "discord.js";
import type { Redis } from "ioredis";
import type { ConfigService } from "../services/ConfigService.js";
import type { ModuleManager } from "../services/ModuleManager.js";

export interface HubServices {
  client: Client;
  prisma: PrismaClient;
  redis: Redis;
  moduleManager: ModuleManager;
  moduleLoader: ModuleLoader;
  configService: ConfigService;
  permits: PermitRepository;
  addons: AddonManager;
  helpers: ReturnType<typeof import("@lumi/db").createDbHelpers>;
}
