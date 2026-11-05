import type { DbHelpers, PrismaClient } from "@lumi/db";
import type { AddonManager } from "@lumi/downloader";
import type { Logger } from "@lumi/foundation";
import type { ModuleConfigService, ModuleRegistryAccess } from "@lumi/module-kit";
import type { ModuleLoader } from "@lumi/module-runtime";
import type { HealthMonitor } from "@lumi/observability";
import type { PermitRepository } from "@lumi/permits";
import type { DistributedScheduler } from "@lumi/scheduler";
import type * as Ui from "@lumi/ui";
import type { Client, PermissionFlagsBits } from "discord.js";
import type { Redis } from "ioredis";
import type { ConfigService } from "../admin/services/ConfigService.js";
import type { ModuleManager } from "../admin/services/ModuleManager.js";

export interface BotServices {
  readonly client: Client;
  readonly redis: Redis;
  readonly prisma: PrismaClient;
  readonly helpers: DbHelpers;
  readonly configService: ConfigService;
  readonly permits: PermitRepository;
  readonly scheduler: DistributedScheduler;
  readonly moduleLoader: ModuleLoader;
  readonly moduleManager: ModuleManager;
  readonly addons: AddonManager;
  readonly moduleConfig: ModuleConfigService;
  readonly modules: ModuleRegistryAccess;
  readonly ui: typeof Ui;
  readonly discord: {
    readonly PermissionFlagsBits: typeof PermissionFlagsBits;
  };
  readonly observability: {
    readonly logger: Logger;
    readonly healthMonitor?: HealthMonitor;
  };
}
