import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { PrismaClient } from "@lumi/db";
import type { ModuleLoader } from "@lumi/module-runtime";
import type { HealthMonitor } from "@lumi/observability";
import { httpRequestDuration, httpRequests } from "@lumi/observability";
import type { PermitRepository } from "@lumi/permits";
import type { Client, Guild } from "discord.js";
import {
  type BackupRecord,
  backupStats,
  previewBackupRestore,
  restoreBackup,
} from "../../modules/security/backup-store.js";
import { permitNodeCatalog } from "../admin/permits/nodes.js";

export interface StatusRouteOptions {
  client: Client;
  healthMonitor: HealthMonitor;
  moduleLoader: Pick<ModuleLoader, "listGlobal">;

  token: string | undefined;
}

export interface PermitNodesRouteOptions {
  moduleLoader: ModuleLoader;
  permits: PermitRepository;

  token: string | undefined;
}

export interface GuildRouteOptions {
  client: Client;
  token: string | undefined;
}

export interface ModuleStateRouteOptions {
  moduleLoader: Pick<ModuleLoader, "listGlobal" | "setEnabled">;
  syncCommands?: (guildId: string) => Promise<void>;
  token: string | undefined;
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 10_000) throw new Error("Body too large");
    chunks.push(buffer);
  }
  if (chunks.length === 0) return null;
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function isAuthorized(
  req: IncomingMessage,
  token: string | undefined,
): boolean {
  if (!token) return true;
  const prefix = "Bearer ";
  const header = req.headers.authorization;
  if (!header?.startsWith(prefix)) return false;
  const provided = Buffer.from(header.slice(prefix.length), "utf8");
  const expected = Buffer.from(token, "utf8");
  return (
    provided.length === expected.length && timingSafeEqual(provided, expected)
  );
}

export function createModuleStateHandler(
  options: ModuleStateRouteOptions,
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  const { moduleLoader, syncCommands, token } = options;

  return async function handleModuleStateRequest(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const startedAt = performance.now();
    const url = new URL(
      req.url ?? "/",
      `http://${req.headers.host ?? "localhost"}`,
    );
    const route = url.pathname;
    const method = req.method ?? "GET";

    const finish = (status: number, body: unknown): void => {
      const seconds = (performance.now() - startedAt) / 1000;
      httpRequests.inc({ method, route, status: String(status) });
      httpRequestDuration.observe(
        { method, route, status: String(status) },
        seconds,
      );
      res.setHeader("content-type", "application/json");
      res.statusCode = status;
      res.end(JSON.stringify(body));
    };

    if (!isAuthorized(req, token)) {
      finish(401, { error: "unauthorized" });
      return;
    }

    const match = route.match(
      /^\/api\/v1\/guilds\/([0-9]+)\/modules\/([^/]+)\/state$/,
    );
    if (!match) {
      finish(404, { error: "not found" });
      return;
    }
    if (method !== "POST") {
      finish(405, { error: "method_not_allowed" });
      return;
    }

    const guildId = match[1]!;
    const moduleName = decodeURIComponent(match[2] ?? "");

    let payload: unknown;
    try {
      payload = await readJsonBody(req);
    } catch {
      finish(400, { error: "invalid_body" });
      return;
    }
    const enabled = (payload as { enabled?: unknown } | null)?.enabled;
    if (typeof enabled !== "boolean") {
      finish(400, { error: "invalid_body" });
      return;
    }

    if (
      !moduleLoader.listGlobal().some((module) => module.name === moduleName)
    ) {
      finish(404, { error: "module_not_found" });
      return;
    }

    await moduleLoader.setEnabled(moduleName, guildId, enabled);
    await syncCommands?.(guildId);
    finish(200, { module: moduleName, enabled });
  };
}

function resolveGuild(guildId: string, client: Client): Guild | null {
  const guild = client.guilds.cache.get(guildId);
  if (guild) return guild;
  return null;
}

export function createPermitNodesHandler(
  options: PermitNodesRouteOptions,
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  const { moduleLoader, permits, token } = options;

  return async function handlePermitNodesRequest(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const startedAt = performance.now();
    const url = new URL(
      req.url ?? "/",
      `http://${req.headers.host ?? "localhost"}`,
    );
    const route = url.pathname;
    const method = req.method ?? "GET";

    const finish = (status: number, body: unknown): void => {
      const seconds = (performance.now() - startedAt) / 1000;
      httpRequests.inc({ method, route, status: String(status) });
      httpRequestDuration.observe(
        { method, route, status: String(status) },
        seconds,
      );
      res.setHeader("content-type", "application/json");
      res.statusCode = status;
      res.end(JSON.stringify(body));
    };

    if (route === "/api/v1/permits/nodes") {
      if (!isAuthorized(req, token)) {
        finish(401, { error: "unauthorized" });
        return;
      }

      const guildId = url.searchParams.get("guild_id") ?? undefined;

      try {
        const nodes = await permitNodeCatalog(
          permits,
          moduleLoader,
          guildId ?? "",
        );
        finish(200, { nodes });
      } catch {
        finish(500, { error: "internal_error" });
      }
      return;
    }

    finish(404, { error: "not found" });
  };
}

export function createGuildHandler(
  options: GuildRouteOptions,
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  const { client, token } = options;

  return async function handleGuildRequest(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const startedAt = performance.now();
    const url = new URL(
      req.url ?? "/",
      `http://${req.headers.host ?? "localhost"}`,
    );
    const route = url.pathname;
    const method = req.method ?? "GET";

    const finish = (status: number, body: unknown): void => {
      const seconds = (performance.now() - startedAt) / 1000;
      httpRequests.inc({ method, route, status: String(status) });
      httpRequestDuration.observe(
        { method, route, status: String(status) },
        seconds,
      );
      res.setHeader("content-type", "application/json");
      res.statusCode = status;
      res.end(JSON.stringify(body));
    };

    const match = route.match(/^\/api\/v1\/guilds\/([0-9]+)$/);
    if (match) {
      if (!isAuthorized(req, token)) {
        finish(401, { error: "unauthorized" });
        return;
      }

      const guildId = match[1];
      const guild = resolveGuild(guildId, client);
      if (!guild) {
        finish(404, { error: "guild_not_found" });
        return;
      }

      finish(200, {
        id: guild.id,
        name: guild.name,
        icon: guild.icon,
        memberCount: guild.memberCount,
      });
      return;
    }

    finish(404, { error: "not found" });
  };
}

export interface BackupRouteOptions {
  client: Client;
  prisma: PrismaClient;
  services: Parameters<typeof restoreBackup>[0];
  token: string | undefined;
}

export function createBackupHandler(
  options: BackupRouteOptions,
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  const { client, prisma, services, token } = options;

  return async function handleBackupRequest(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const startedAt = performance.now();
    const url = new URL(
      req.url ?? "/",
      `http://${req.headers.host ?? "localhost"}`,
    );
    const route = url.pathname;
    const method = req.method ?? "GET";

    const finish = (status: number, body: unknown): void => {
      const seconds = (performance.now() - startedAt) / 1000;
      httpRequests.inc({ method, route, status: String(status) });
      httpRequestDuration.observe(
        { method, route, status: String(status) },
        seconds,
      );
      res.setHeader("content-type", "application/json");
      res.statusCode = status;
      res.end(JSON.stringify(body));
    };

    if (!isAuthorized(req, token)) {
      finish(401, { error: "unauthorized" });
      return;
    }

    const match = route.match(
      /^\/api\/v1\/guilds\/([0-9]+)\/backups\/([^/]+)\/(preview|restore)$/,
    );
    if (!match) {
      finish(404, { error: "not found" });
      return;
    }

    const guildId = match[1];
    const backupId = decodeURIComponent(match[2] ?? "");
    const action = match[3];

    if (action === "restore" && method !== "POST") {
      finish(405, { error: "method_not_allowed" });
      return;
    }
    if (action === "preview" && method !== "GET") {
      finish(405, { error: "method_not_allowed" });
      return;
    }

    const guild = resolveGuild(guildId, client);
    if (!guild) {
      finish(404, { error: "guild_not_found" });
      return;
    }

    let backup: BackupRecord | null = null;
    try {
      backup = (await prisma.securityBackup.findFirst({
        where: { id: backupId, guildId },
      })) as unknown as BackupRecord | null;
    } catch {
      finish(500, { error: "internal_error" });
      return;
    }

    if (!backup) {
      finish(404, { error: "backup_not_found" });
      return;
    }

    const summary = {
      id: backup.id,
      reason: backup.reason,
      createdAt: backup.createdAt,
      stats: backupStats(backup.data),
    };

    if (action === "preview") {
      const diff = previewBackupRestore(guild, backup.data);
      finish(200, { backup: summary, diff });
      return;
    }

    try {
      const result = await restoreBackup(services, guild, backup.data);
      finish(200, { backup: summary, result });
    } catch {
      finish(500, { error: "restore_failed" });
    }
  };
}

export function createStatusHandler(
  options: StatusRouteOptions,
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  const { client, healthMonitor, moduleLoader, token } = options;

  return async function handleStatusRequest(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const startedAt = performance.now();
    const url = new URL(
      req.url ?? "/",
      `http://${req.headers.host ?? "localhost"}`,
    );
    const route = url.pathname;
    const method = req.method ?? "GET";

    const finish = (status: number, body: unknown): void => {
      const seconds = (performance.now() - startedAt) / 1000;
      httpRequests.inc({ method, route, status: String(status) });
      httpRequestDuration.observe(
        { method, route, status: String(status) },
        seconds,
      );
      res.setHeader("content-type", "application/json");
      res.statusCode = status;
      res.end(JSON.stringify(body));
    };

    if (route === "/healthz") {
      const checks = await healthMonitor.runChecks();
      finish(checks.healthy ? 200 : 503, {
        ok: checks.healthy,
        ready: client.isReady(),
        checks: checks.results,
      });
      return;
    }

    if (route === "/ready" || route === "/readyz") {
      finish(client.isReady() ? 200 : 503, { ready: client.isReady() });
      return;
    }

    if (route === "/api/v1/status") {
      if (!isAuthorized(req, token)) {
        finish(401, { error: "unauthorized" });
        return;
      }
      finish(200, {
        bot: client.user?.tag ?? null,
        guilds: client.guilds.cache.size,
        users: client.users.cache.size,
        modules: moduleLoader.listGlobal(),
      });
      return;
    }

    finish(404, { error: "not found" });
  };
}
