import { serverConfig } from "./env.js";

export interface PermitNodesResponse {
  nodes: string[];
}

export interface RpcError {
  error: string;
}

export async function fetchPermitNodes(guildId: string): Promise<string[]> {
  const config = serverConfig();
  if (!config.rpcUrl) {
    return [];
  }

  const url = new URL("/api/v1/permits/nodes", config.rpcUrl);
  url.searchParams.set("guild_id", guildId);

  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (config.rpcInternalToken) {
    headers.Authorization = `Bearer ${config.rpcInternalToken}`;
  }

  try {
    const response = await fetch(url.toString(), {
      headers,
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      return [];
    }
    const data = (await response.json()) as PermitNodesResponse | RpcError;
    if ("error" in data) {
      return [];
    }
    return data.nodes ?? [];
  } catch {
    return [];
  }
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

function rpcHeaders(): Record<string, string> {
  const config = serverConfig();
  const headers: Record<string, string> = { Accept: "application/json" };
  if (config.rpcInternalToken) {
    headers.Authorization = `Bearer ${config.rpcInternalToken}`;
  }
  return headers;
}

export async function fetchBackupPreview(
  guildId: string,
  backupId: string,
): Promise<BackupPreview | null> {
  const config = serverConfig();
  if (!config.rpcUrl) return null;

  const url = new URL(
    `/api/v1/guilds/${guildId}/backups/${encodeURIComponent(backupId)}/preview`,
    config.rpcUrl,
  );

  try {
    const response = await fetch(url.toString(), {
      headers: rpcHeaders(),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) return null;
    return (await response.json()) as BackupPreview;
  } catch {
    return null;
  }
}

export interface ModuleStateResult {
  ok: boolean;
  error?: string;
}

export async function setModuleStateViaRpc(
  guildId: string,
  moduleName: string,
  enabled: boolean,
): Promise<ModuleStateResult> {
  const config = serverConfig();
  if (!config.rpcUrl) {
    return { ok: false, error: "RPC is not configured." };
  }

  const url = new URL(
    `/api/v1/guilds/${guildId}/modules/${encodeURIComponent(moduleName)}/state`,
    config.rpcUrl,
  );

  try {
    const response = await fetch(url.toString(), {
      method: "POST",
      headers: {
        ...rpcHeaders(),
        "content-type": "application/json",
      },
      body: JSON.stringify({ enabled }),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      return {
        ok: false,
        error: `The bot rejected the module update (HTTP ${response.status}).`,
      };
    }
    return { ok: true };
  } catch {
    return {
      ok: false,
      error: "The bot did not respond to the module update.",
    };
  }
}

export async function restoreBackupViaRpc(
  guildId: string,
  backupId: string,
): Promise<
  { ok: true; result: BackupRestoreResult } | { ok: false; error: string }
> {
  const config = serverConfig();
  if (!config.rpcUrl) {
    return { ok: false, error: "RPC is not configured." };
  }

  const url = new URL(
    `/api/v1/guilds/${guildId}/backups/${encodeURIComponent(backupId)}/restore`,
    config.rpcUrl,
  );

  try {
    const response = await fetch(url.toString(), {
      method: "POST",
      headers: rpcHeaders(),
      signal: AbortSignal.timeout(60000),
    });
    const data = (await response.json()) as
      { result: BackupRestoreResult } | RpcError;
    if (!response.ok || "error" in data) {
      return {
        ok: false,
        error:
          "error" in data
            ? `Restore failed: ${data.error}`
            : `Restore failed (HTTP ${response.status}).`,
      };
    }
    return { ok: true, result: data.result };
  } catch {
    return {
      ok: false,
      error: "The bot did not respond to the restore request.",
    };
  }
}
