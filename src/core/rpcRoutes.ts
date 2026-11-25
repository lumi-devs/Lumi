import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { AddonManager } from "@lumi/downloader";
import type { ModuleLoader } from "@lumi/module-runtime";
import type { HealthMonitor } from "@lumi/observability";
import { httpRequestDuration, httpRequests } from "@lumi/observability";
import type { PermitRepository } from "@lumi/permits";
import type { PrismaClient } from "@prisma/client";
import type { Client, Guild } from "discord.js";
import {
  type BackupRecord,
  backupStats,
  previewBackupRestore,
  restoreBackup,
  toBackupRecord,
} from "../../modules/shared/backup-store/index.js";
import { permitNodeCatalog } from "./permitNodes.js";

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

export interface ModuleRouteOptions {
  moduleLoader: Pick<ModuleLoader, "listGlobal" | "setEnabled" | "isEnabled">;
  prisma?: PrismaClient;
  syncCommands?: (guildId: string) => Promise<void>;
  token: string | undefined;
}
export interface ConfigRouteOptions {
  configCache: { delete(...keys: string[]): Promise<void> };
  token: string | undefined;
}
export interface AddonRouteOptions {
  addons: AddonManager;
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

const LoopbackAddresses = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

function decodePathPart(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function isLoopback(req: IncomingMessage): boolean {
  return LoopbackAddresses.has(req.socket.remoteAddress ?? "");
}

function isAuthorized(
  req: IncomingMessage,
  token: string | undefined,
): boolean {
  if (!token) {
    // Without a shared secret, only processes on the same host may use the
    // control API. Public binds still require RPC_INTERNAL_TOKEN.
    return isLoopback(req);
  }
  const prefix = "Bearer ";
  const header = req.headers.authorization;
  if (!header?.startsWith(prefix)) return false;
  const provided = Buffer.from(header.slice(prefix.length), "utf8");
  const expected = Buffer.from(token, "utf8");
  return (
    provided.length === expected.length && timingSafeEqual(provided, expected)
  );
}
function normalizeRoute(pathname: string): string {
  return pathname
    .split("/")
    .map((segment) => (/^\d{16,20}$/.test(segment) ? ":id" : segment))
    .join("/");
}

function createResponseFinisher(
  req: IncomingMessage,
  res: ServerResponse,
  route: string,
  startedAt: number,
): (status: number, body: unknown) => void {
  const method = req.method ?? "GET";
  const label = normalizeRoute(route);
  return (status: number, body: unknown): void => {
    const seconds = (performance.now() - startedAt) / 1000;
    httpRequests.inc({ method, route: label, status: String(status) });
    httpRequestDuration.observe(
      { method, route: label, status: String(status) },
      seconds,
    );
    res.setHeader("content-type", "application/json");
    res.statusCode = status;
    res.end(JSON.stringify(body));
  };
}

export function createModuleHandler(
  options: ModuleRouteOptions,
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  const { moduleLoader, prisma, syncCommands, token } = options;
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
    const finish = createResponseFinisher(req, res, route, startedAt);

    if (!isAuthorized(req, token)) {
      finish(401, { error: "unauthorized" });
      return;
    }

    const catalogMatch = route.match(/^\/api\/v1\/guilds\/([0-9]+)\/modules$/);
    if (catalogMatch) {
      if (method !== "GET") {
        finish(405, { error: "method_not_allowed" });
        return;
      }
      const guildId = catalogMatch[1]!;
      const modules = moduleLoader.listGlobal().map((module) => ({
        ...module,
        enabled: moduleLoader.isEnabled(guildId, module.name),
      }));
      finish(200, { modules });
      return;
    }

    const stateMatch = route.match(
      /^\/api\/v1\/guilds\/([0-9]+)\/modules\/([^/]+)\/state$/,
    );
    if (!stateMatch) {
      finish(404, { error: "not found" });
      return;
    }
    if (method !== "POST") {
      finish(405, { error: "method_not_allowed" });
      return;
    }

    const guildId = stateMatch[1]!;
    const moduleName = decodePathPart(stateMatch[2] ?? "");
    if (!moduleName) {
      finish(400, { error: "invalid_path" });
      return;
    }

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

    if (prisma) {
      await prisma.guild.upsert({
        where: { id: guildId },
        update: {},
        create: { id: guildId },
      });
      await prisma.guildModule.upsert({
        where: { guildId_module: { guildId, module: moduleName } },
        update: { enabled },
        create: { guildId, module: moduleName, enabled },
      });
    }
    await moduleLoader.setEnabled(moduleName, guildId, enabled);
    await syncCommands?.(guildId);
    finish(200, { module: moduleName, enabled });
  };
}

function addonError(error: unknown): string {
  return error instanceof Error ? error.message : "Add-on operation failed.";
}

export function createConfigHandler(
  options: ConfigRouteOptions,
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  const { configCache, token } = options;

  return async function handleConfigRequest(
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
    const finish = createResponseFinisher(req, res, route, startedAt);

    if (!isAuthorized(req, token)) {
      finish(401, { error: "unauthorized" });
      return;
    }

    const match = route.match(
      /^\/api\/v1\/guilds\/([0-9]+)\/config\/invalidate$/,
    );
    if (!match) {
      finish(404, { error: "not found" });
      return;
    }
    if (method !== "POST") {
      finish(405, { error: "method_not_allowed" });
      return;
    }

    await configCache.delete(match[1]!);
    finish(200, { ok: true });
  };
}

export function createAddonHandler(
  options: AddonRouteOptions,
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  const { addons, token } = options;

  return async function handleAddonRequest(
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
    const finish = createResponseFinisher(req, res, route, startedAt);

    if (!isAuthorized(req, token)) {
      finish(401, { error: "unauthorized" });
      return;
    }

    try {
      if (route === "/api/v1/addons") {
        if (method !== "GET") {
          finish(405, { error: "method_not_allowed" });
          return;
        }
        const [repos, installed, autoUpdate] = await Promise.all([
          addons.listRepos(),
          addons.listInstalled(),
          addons.getAutoUpdate(),
        ]);
        const withCandidates = await Promise.all(
          repos.map(async (repo) => ({
            ...repo,
            candidates: await addons.listRepoModules(repo.name).catch(() => []),
          })),
        );
        finish(200, { repos: withCandidates, installed, autoUpdate });
        return;
      }

      if (route === "/api/v1/addons/repos") {
        if (method !== "POST") {
          finish(405, { error: "method_not_allowed" });
          return;
        }
        const body = (await readJsonBody(req)) as {
          name?: unknown;
          url?: unknown;
          branch?: unknown;
        } | null;
        if (
          !body ||
          typeof body.name !== "string" ||
          typeof body.url !== "string" ||
          (body.branch !== undefined && typeof body.branch !== "string")
        ) {
          finish(400, { error: "invalid_body" });
          return;
        }
        const repo = await addons.addRepo(
          body.name,
          body.url,
          typeof body.branch === "string" ? body.branch : undefined,
        );
        finish(201, { repo });
        return;
      }

      const repoMatch = route.match(/^\/api\/v1\/addons\/repos\/([^/]+)$/);
      if (repoMatch) {
        const name = decodePathPart(repoMatch[1] ?? "");
        if (!name) {
          finish(400, { error: "invalid_path" });
          return;
        }
        if (method !== "DELETE") {
          finish(405, { error: "method_not_allowed" });
          return;
        }
        await addons.removeRepo(name);
        finish(200, { ok: true });
        return;
      }

      const updateMatch = route.match(
        /^\/api\/v1\/addons\/repos\/([^/]+)\/update$/,
      );
      if (updateMatch) {
        const name = decodePathPart(updateMatch[1] ?? "");
        if (!name) {
          finish(400, { error: "invalid_path" });
          return;
        }
        if (method !== "POST") {
          finish(405, { error: "method_not_allowed" });
          return;
        }
        const result = await addons.updateRepo(name);
        finish(200, { result });
        return;
      }

      if (route === "/api/v1/addons/install") {
        if (method !== "POST") {
          finish(405, { error: "method_not_allowed" });
          return;
        }
        const body = (await readJsonBody(req)) as {
          repo?: unknown;
          module?: unknown;
        } | null;
        if (
          !body ||
          typeof body.repo !== "string" ||
          typeof body.module !== "string"
        ) {
          finish(400, { error: "invalid_body" });
          return;
        }
        await addons.install(body.repo, body.module);
        finish(200, { ok: true });
        return;
      }

      const moduleMatch = route.match(/^\/api\/v1\/addons\/modules\/([^/]+)$/);
      if (moduleMatch) {
        const name = decodePathPart(moduleMatch[1] ?? "");
        if (!name) {
          finish(400, { error: "invalid_path" });
          return;
        }
        if (method !== "DELETE") {
          finish(405, { error: "method_not_allowed" });
          return;
        }
        await addons.uninstall(name);
        finish(200, { ok: true });
        return;
      }

      const pinMatch = route.match(
        /^\/api\/v1\/addons\/modules\/([^/]+)\/pin$/,
      );
      if (pinMatch) {
        const name = decodePathPart(pinMatch[1] ?? "");
        if (!name) {
          finish(400, { error: "invalid_path" });
          return;
        }
        if (method !== "POST") {
          finish(405, { error: "method_not_allowed" });
          return;
        }
        const body = (await readJsonBody(req)) as { pinned?: unknown } | null;
        if (!body || typeof body.pinned !== "boolean") {
          finish(400, { error: "invalid_body" });
          return;
        }
        await addons.setPinned(name, body.pinned);
        finish(200, { ok: true });
        return;
      }

      finish(404, { error: "not found" });
    } catch (error) {
      finish(400, { error: addonError(error) });
    }
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

    const finish = createResponseFinisher(req, res, route, startedAt);

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

    const finish = createResponseFinisher(req, res, route, startedAt);

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

    const finish = createResponseFinisher(req, res, route, startedAt);

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
    const backupId = decodePathPart(match[2] ?? "");
    const action = match[3];
    if (!backupId) {
      finish(400, { error: "invalid_path" });
      return;
    }

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
      const record = await prisma.securityBackup.findFirst({
        where: { id: backupId, guildId },
      });
      backup = record ? toBackupRecord(record) : null;
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

    const finish = createResponseFinisher(req, res, route, startedAt);

    if (route === "/healthz") {
      const checks = await healthMonitor.runChecks();
      const authorized = isAuthorized(req, token);
      finish(checks.healthy ? 200 : 503, {
        ok: checks.healthy,
        ready: client.isReady(),
        checks: checks.results.map((result) =>
          authorized ? result : { name: result.name, healthy: result.healthy },
        ),
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
