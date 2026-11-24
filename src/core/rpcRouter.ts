import type { IncomingMessage, ServerResponse } from "node:http";
import type { AddonManager } from "@lumi/downloader";
import type { Logger } from "@lumi/foundation";
import type { ModuleLoader } from "@lumi/module-runtime";
import type { HealthMonitor } from "@lumi/observability";
import type { PermitRepository } from "@lumi/permits";
import type { PrismaClient } from "@prisma/client";
import type { Client } from "discord.js";
import type { SyncGuildCommands } from "./commandSync.js";
import {
  createAddonHandler,
  createBackupHandler,
  createConfigHandler,
  createGuildHandler,
  createModuleHandler,
  createPermitNodesHandler,
  createStatusHandler,
} from "./rpcRoutes.js";

export interface RpcRouterOptions {
  readonly client: Client;
  readonly prisma: PrismaClient;
  readonly healthMonitor: HealthMonitor;
  readonly moduleLoader: ModuleLoader;
  readonly addons: AddonManager;
  readonly permits: PermitRepository;
  readonly logger: Logger;
  readonly token: string | undefined;
  readonly getSyncGuildCommands: () => SyncGuildCommands | undefined;
  readonly configCache: { delete(...keys: string[]): Promise<void> };
}

export function createRpcRouter(
  options: RpcRouterOptions,
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  const {
    client,
    prisma,
    healthMonitor,
    moduleLoader,
    addons,
    permits,
    logger,
    token,
  } = options;
  const statusHandler = createStatusHandler({
    client,
    healthMonitor,
    moduleLoader,
    token,
  });
  const nodesHandler = createPermitNodesHandler({
    moduleLoader,
    permits,
    token,
  });
  const guildHandler = createGuildHandler({ client, token });
  const addonHandler = createAddonHandler({ addons, token });
  const moduleHandler = createModuleHandler({
    moduleLoader,
    prisma,
    syncCommands: (guildId) =>
      options.getSyncGuildCommands()?.(guildId) ?? Promise.resolve(),
    token,
  });
  const configHandler = createConfigHandler({
    configCache: options.configCache,
    token,
  });
  const backupHandler = createBackupHandler({
    client,
    prisma,
    services: { observability: { logger } },
    token,
  });

  return async (req, res) => {
    const url = new URL(
      req.url ?? "/",
      `http://${req.headers.host ?? "localhost"}`,
    );

    if (url.pathname.startsWith("/api/v1/addons")) {
      await addonHandler(req, res);
      return;
    }

    if (url.pathname === "/api/v1/permits/nodes") {
      await nodesHandler(req, res);
      return;
    }

    if (
      url.pathname.startsWith("/api/v1/guilds/") &&
      url.pathname.includes("/backups/")
    ) {
      await backupHandler(req, res);
      return;
    }

    if (/^\/api\/v1\/guilds\/[0-9]+\/config\/invalidate$/.test(url.pathname)) {
      await configHandler(req, res);
      return;
    }

    if (
      url.pathname.startsWith("/api/v1/guilds/") &&
      (/\/modules$/.test(url.pathname) || url.pathname.includes("/modules/"))
    ) {
      await moduleHandler(req, res);
      return;
    }

    if (url.pathname.startsWith("/api/v1/guilds/")) {
      await guildHandler(req, res);
      return;
    }

    await statusHandler(req, res);
  };
}
