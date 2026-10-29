import type { PrismaClient } from "@lumi/db";
import type { AddonManager } from "@lumi/downloader";
import type { ModuleLoader } from "@lumi/module-runtime";
import type { PermitRepository } from "@lumi/permits";
import type { Redis } from "ioredis";
import type { ConfigService } from "../services/ConfigService.js";
import type { ModuleManager } from "../services/ModuleManager.js";

export interface HubServices {
  prisma: PrismaClient;
  redis: Redis;
  moduleManager: ModuleManager;
  moduleLoader: ModuleLoader;
  configService: ConfigService;
  permits: PermitRepository;
  addons: AddonManager;
}
