import type { IncomingMessage, ServerResponse } from "node:http";
import type { PrismaClient } from "@lumi/db";
import type { Logger } from "@lumi/foundation";
import type { ModuleLoader } from "@lumi/module-runtime";
import type { HealthMonitor } from "@lumi/observability";
import type { PermitRepository } from "@lumi/permits";
import type { Client } from "discord.js";
import type { SyncGuildCommands } from "./commandSync.js";
import {
  createBackupHandler,
  createGuildHandler,
  createModuleStateHandler,
  createPermitNodesHandler,
  createStatusHandler,
} from "./rpcRoutes.js";

export interface RpcRouterOptions {
  readonly client: Client;
  readonly prisma: PrismaClient;
  readonly healthMonitor: HealthMonitor;
  readonly moduleLoader: ModuleLoader;
  readonly permits: PermitRepository;
  readonly logger: Logger;
  readonly token: string | undefined;
  readonly getSyncGuildCommands: () => SyncGuildCommands | undefined;
}

export function createRpcRouter(
  options: RpcRouterOptions,
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  const { client, prisma, healthMonitor, moduleLoader, permits, logger, token } =
    options;

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
  const moduleStateHandler = createModuleStateHandler({
    moduleLoader,
    syncCommands: (guildId) =>
      options.getSyncGuildCommands()?.(guildId) ?? Promise.resolve(),
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

    if (
      url.pathname.startsWith("/api/v1/guilds/") &&
      url.pathname.includes("/modules/")
    ) {
      await moduleStateHandler(req, res);
      return;
    }

    if (url.pathname.startsWith("/api/v1/guilds/")) {
      await guildHandler(req, res);
      return;
    }

    await statusHandler(req, res);
  };
}
