import type { ModuleLoader } from "@lumi/module-runtime";
import type { AddonManager } from "@lumi/downloader";
import type { PermitRepository } from "@lumi/permits";
import type { PrismaClient } from "@lumi/db";
import type { Redis } from "ioredis";
import type { ModuleManager } from "../services/ModuleManager.js";
import type { ConfigService } from "../services/ConfigService.js";

export interface HubServices {
  prisma: PrismaClient;
  redis: Redis;
  moduleManager: ModuleManager;
  moduleLoader: ModuleLoader;
  configService: ConfigService;
  permits: PermitRepository;
  addons: AddonManager;
}
