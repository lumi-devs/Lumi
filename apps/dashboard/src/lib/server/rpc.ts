import { logger } from "@lumi/foundation";
import { serverConfig } from "./env.js";

export interface PermitNodesResponse {
  nodes: string[];
}

export interface RpcConfigField {
  key: string;
  label: string;
  type: string;
  description?: string;
  required?: boolean;
  default?: unknown;
  choices?: string[];
  category?: string;
  min?: number;
  max?: number;
  integer?: boolean;
  channelTypes?: number[];
}

export interface RpcModule {
  name: string;
  displayName: string;
  emoji: string;
  description: string;
  version: string;
  configKey?: string;
  configFields: RpcConfigField[];
  category: string | null;
  origin: "bundled" | "addon";
  enabled: boolean;
}

export interface RpcError {
  error: string;
}

export type RpcResult<T> = { ok: true; data: T } | { ok: false; error: string };

function isRpcError(value: unknown): value is RpcError {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof (value as RpcError).error === "string"
  );
}

async function rpcRequest<T>(
  path: string,
  init: RequestInit = {},
  timeoutMs = 5000,
): Promise<RpcResult<T>> {
  const config = serverConfig();
  if (!config.rpcUrl) {
    return { ok: false, error: "RPC is not configured." };
  }

  const url = new URL(path, config.rpcUrl);
  const headers = new Headers(init.headers);
  headers.set("accept", "application/json");
  if (config.rpcInternalToken) {
    headers.set("authorization", `Bearer ${config.rpcInternalToken}`);
  }

  try {
    const response = await fetch(url, {
      ...init,
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    });
    const data: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      return {
        ok: false,
        error: isRpcError(data)
          ? data.error
          : `The bot rejected the request (HTTP ${response.status}).`,
      };
    }
    if (data === null || isRpcError(data)) {
      return { ok: false, error: "The bot returned an invalid response." };
    }
    return { ok: true, data: data as T };
  } catch {
    return { ok: false, error: "The bot did not respond." };
  }
}

export async function fetchPermitNodes(guildId: string): Promise<string[]> {
  const result = await rpcRequest<PermitNodesResponse>(
    `/api/v1/permits/nodes?guild_id=${encodeURIComponent(guildId)}`,
  );
  return result.ok ? result.data.nodes : [];
}

export async function fetchModules(
  guildId: string,
): Promise<RpcModule[] | null> {
  const result = await rpcRequest<{ modules: RpcModule[] }>(
    `/api/v1/guilds/${encodeURIComponent(guildId)}/modules`,
  );
  return result.ok ? result.data.modules : null;
}

export interface BackupStats {
  roles: number;
  channels: number;
  categories: number;
  text: number;
  voice: number;
  forums: number;
  announcements: number;
  media: number;
  stages: number;
  overwrites: number;
}

export interface BackupChange {
  id: string;
  name: string;
  action: "create" | "update";
  fields: string[];
}

export interface BackupDiff {
  roles: BackupChange[];
  channels: BackupChange[];
  unchangedRoles: number;
  unchangedChannels: number;
  warnings: string[];
}

export interface BackupSummary {
  id: string;
  reason: string;
  createdAt: string;
  stats: BackupStats;
}

export interface BackupPreview {
  backup: BackupSummary;
  diff: BackupDiff;
}

export interface BackupRestoreResult {
  rolesCreated: number;
  rolesUpdated: number;
  channelsCreated: number;
  channelsUpdated: number;
  warnings: string[];
}

export async function fetchBackupPreview(
  guildId: string,
  backupId: string,
): Promise<BackupPreview | null> {
  const result = await rpcRequest<BackupPreview>(
    `/api/v1/guilds/${encodeURIComponent(guildId)}/backups/${encodeURIComponent(backupId)}/preview`,
    {},
    15000,
  );
  return result.ok ? result.data : null;
}

export interface ModuleStateResult {
  ok: boolean;
  error?: string;
}

export interface AddonModule {
  name: string;
  displayName: string;
  emoji: string;
  description: string;
  version: string;
  installed: boolean;
}

export interface AddonRepo {
  id: number;
  name: string;
  url: string;
  branch: string | null;
  commit: string | null;
  installed: number;
  candidates: AddonModule[];
}

export interface InstalledAddon {
  name: string;
  version: string | null;
  commit: string | null;
  pinned: boolean;
  installedAt: string;
  repoName: string;
}

export interface AutoUpdateState {
  enabled: boolean;
  intervalMinutes: number;
  lastCheckedAt: string | null;
}

export interface AddonCatalog {
  repos: AddonRepo[];
  installed: InstalledAddon[];
  autoUpdate: AutoUpdateState;
}

export interface RepoUpdateResult {
  repo: string;
  oldCommit: string | null;
  newCommit: string;
  changed: boolean;
  updated: string[];
  pinned: string[];
  failures: Array<{ module: string; error: string }>;
}

export async function fetchAddons(): Promise<RpcResult<AddonCatalog>> {
  return rpcRequest<AddonCatalog>("/api/v1/addons", {}, 15000);
}

export async function addAddonRepo(
  name: string,
  url: string,
  branch: string,
): Promise<RpcResult<unknown>> {
  return rpcRequest("/api/v1/addons/repos", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, url, branch: branch || undefined }),
  });
}

export async function removeAddonRepo(
  name: string,
): Promise<RpcResult<unknown>> {
  return rpcRequest(
    `/api/v1/addons/repos/${encodeURIComponent(name)}`,
    { method: "DELETE" },
    15000,
  );
}

export async function updateAddonRepo(
  name: string,
): Promise<RpcResult<{ result: RepoUpdateResult }>> {
  return rpcRequest(
    `/api/v1/addons/repos/${encodeURIComponent(name)}/update`,
    { method: "POST" },
    60000,
  );
}

export async function installAddon(
  repo: string,
  moduleName: string,
): Promise<RpcResult<unknown>> {
  return rpcRequest(
    "/api/v1/addons/install",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ repo, module: moduleName }),
    },
    30000,
  );
}

export async function uninstallAddon(
  moduleName: string,
): Promise<RpcResult<unknown>> {
  return rpcRequest(
    `/api/v1/addons/modules/${encodeURIComponent(moduleName)}`,
    { method: "DELETE" },
    15000,
  );
}

export async function pinAddon(
  moduleName: string,
  pinned: boolean,
): Promise<RpcResult<unknown>> {
  return rpcRequest(
    `/api/v1/addons/modules/${encodeURIComponent(moduleName)}/pin`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pinned }),
    },
  );
}

export async function setModuleStateViaRpc(
  guildId: string,
  moduleName: string,
  enabled: boolean,
): Promise<ModuleStateResult> {
  const result = await rpcRequest(
    `/api/v1/guilds/${encodeURIComponent(guildId)}/modules/${encodeURIComponent(moduleName)}/state`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled }),
    },
  );
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

export async function invalidateGuildConfig(guildId: string): Promise<void> {
  const result = await rpcRequest(
    `/api/v1/guilds/${encodeURIComponent(guildId)}/config/invalidate`,
    { method: "POST" },
  );
  if (!result.ok) {
    logger.warn("[dashboard] guild config invalidation failed", {
      guildId,
      error: result.error,
    });
  }
}

export async function restoreBackupViaRpc(
  guildId: string,
  backupId: string,
): Promise<
  { ok: true; result: BackupRestoreResult } | { ok: false; error: string }
> {
  const result = await rpcRequest<{ result: BackupRestoreResult }>(
    `/api/v1/guilds/${encodeURIComponent(guildId)}/backups/${encodeURIComponent(backupId)}/restore`,
    { method: "POST" },
    60000,
  );
  return result.ok
    ? { ok: true, result: result.data.result }
    : { ok: false, error: `Restore failed: ${result.error}` };
}
