import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function envParseString(key: string, defaultValue?: string): string {
  const value = process.env[key];
  if (value !== undefined) return value;
  if (defaultValue !== undefined) return defaultValue;
  throw new Error(`[ENV] Missing: ${key}`);
}

export function envParseInteger(key: string, defaultValue?: number): number {
  const raw = process.env[key];
  if (raw !== undefined) {
    const trimmed = raw.trim();
    if (trimmed.length > 0 && /^-?\d+$/.test(trimmed)) {
      return parseInt(trimmed, 10);
    }
    throw new Error(`[ENV] Invalid integer: ${key}=${raw}`);
  }
  if (defaultValue !== undefined) return defaultValue;
  throw new Error(`[ENV] Missing: ${key}`);
}

export const getNodeEnv = (): string => process.env["NODE_ENV"] || "development";
export const isDevelopment = (): boolean => getNodeEnv() === "development";
export const isProduction = (): boolean => getNodeEnv() === "production";

export const DEFAULT_BOT_PREFIX = ".";

let cachedRepoRoot: string | null = null;

export function getRepoRoot(): string {
  if (cachedRepoRoot) return cachedRepoRoot;
  let dir = path.dirname(fileURLToPath(import.meta.url));
  while (true) {
    if (existsSync(path.join(dir, "packages", "core", "package.json"))) {
      cachedRepoRoot = dir;
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      cachedRepoRoot = process.cwd();
      return cachedRepoRoot;
    }
    dir = parent;
  }
}

export function getDefaultPrefix(): string {
  return envParseString("DEFAULT_PREFIX", DEFAULT_BOT_PREFIX);
}

export function validateRequiredEnv(keys: readonly string[]): void {
  const missing = keys.filter((key) => process.env[key] === undefined);
  if (missing.length > 0) {
    throw new Error(
      `[ENV] Missing required environment variable(s): ${missing.join(", ")}`,
    );
  }
}

type EnvFieldParser<T> = (key: string, raw: string | undefined) => T;

type EnvShape = Record<string, EnvFieldParser<unknown>>;

export type EnvResult<T extends EnvShape> = {
  readonly [K in keyof T]: ReturnType<T[K]>;
};

class MissingEnvError extends Error {
  constructor() {
    super("required but not set");
    this.name = "MissingEnvError";
  }
}

export const envField = {
  string: (defaultValue?: string): EnvFieldParser<string> =>
    (_key, raw) => {
      if (raw !== undefined && raw !== "") return raw;
      if (defaultValue !== undefined) return defaultValue;
      throw new MissingEnvError();
    },
  integer: (defaultValue?: number): EnvFieldParser<number> =>
    (key, raw) => {
      if (raw !== undefined && raw.trim() !== "") {
        const n = Number.parseInt(raw.trim(), 10);
        if (!Number.isNaN(n)) return n;
        throw new Error(`[ENV] Invalid integer: ${key}=${raw}`);
      }
      if (defaultValue !== undefined) return defaultValue;
      throw new MissingEnvError();
    },
  boolean: (defaultValue?: boolean): EnvFieldParser<boolean> =>
    (key, raw) => {
      if (raw === "true") return true;
      if (raw === "false") return false;
      if (raw !== undefined && raw !== "") throw new Error(`[ENV] Invalid boolean: ${key}=${raw}`);
      if (defaultValue !== undefined) return defaultValue;
      throw new MissingEnvError();
    },
};

export function defineEnv<T extends EnvShape>(shape: T): EnvResult<T> {
  const result: Record<string, unknown> = {};
  const errors: string[] = [];

  for (const [key, parser] of Object.entries(shape)) {
    const raw = process.env[key];
    try {
      result[key] = parser(key, raw);
    } catch (err) {
      if (err instanceof MissingEnvError) {
        errors.push(`  ${key}: required but not set`);
      } else if (err instanceof Error) {
        errors.push(`  ${err.message}`);
      } else {
        errors.push(`  ${key}: invalid value`);
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(`[ENV] Configuration errors:\n${errors.join("\n")}`);
  }

  return result as EnvResult<T>;
}

export function getShardCount(): number {
  const raw = process.env["SHARD_COUNT"];
  if (raw !== undefined && raw.trim() !== "" && raw.trim() !== "auto") {
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) {
      throw new Error(`[ENV] SHARD_COUNT=${raw} is not a positive integer (or "auto").`);
    }
    return Math.floor(n);
  }

  const list = process.env["SHARDS"];
  if (list) {
    try {
      const parsed: unknown = JSON.parse(list);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed.length;
    } catch {
      // fall through
    }
  }
  return 1;
}

export function getShardOption(): number | "auto" {
  const raw = process.env["SHARD_COUNT"]?.trim();
  if (!raw || raw === "auto") return "auto";
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) {
    throw new Error(`[ENV] SHARD_COUNT=${raw} is not a positive integer (or "auto").`);
  }
  return n;
}

export function resolvePgPoolSize(): number {
  const explicit = Number(process.env["POSTGRES_POOL_MAX"]);
  if (Number.isFinite(explicit) && explicit > 0) return Math.floor(explicit);

  const budget = Number(process.env["POSTGRES_POOL_TOTAL"]);
  const total = Number.isFinite(budget) && budget > 0 ? budget : 80;

  return Math.max(2, Math.floor(total / getShardCount()));
}

export function resolveDbSlowQueryThresholdMs(): number {
  return envParseInteger("DB_SLOW_QUERY_THRESHOLD_MS", 1000);
}

export function getConsumerId(): string {
  return (
    process.env["LUMI_CONSUMER_ID"] ??
    process.env["HOSTNAME"] ??
    `worker-${process.pid}`
  );
}

export function isPrimaryShard(): boolean {
  if (!process.env["SHARDING_MANAGER"]) return true;
  const raw = process.env["SHARDS"];
  if (!raw) return true;
  try {
    const parsed: unknown = JSON.parse(raw);
    const ids = Array.isArray(parsed) ? parsed : [parsed];
    const shardListRaw = process.env["SHARD_LIST"]?.trim();
    if (shardListRaw && shardListRaw !== "auto") {
      const configured = shardListRaw.split(",").map((s) => Number.parseInt(s.trim(), 10)).filter((n) => !Number.isNaN(n));
      if (configured.length > 0) {
        return ids.includes(configured[0]);
      }
    }
    return ids.includes(0);
  } catch {
    return true;
  }
}

export const getClusterName = (): string | null =>
  process.env["CLUSTER_NAME"]?.trim() || null;

export function getDevModulePaths(): string[] {
  const raw = process.env["LUMI_DEV_PATHS"]?.trim();
  if (!raw) return [];
  return raw
    .split(/[,:]/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

export const getDiscordProxyUrl = (): string | null => {
  const raw = process.env["DISCORD_PROXY_URL"]?.trim();
  if (!raw) return null;
  return raw.replace(/\/+$/, "");
};

export const getDashboardPublicUrl = (): string | null => {
  const raw = process.env["DASHBOARD_PUBLIC_URL"]?.trim();
  if (!raw) return null;
  return raw.replace(/\/+$/, "");
};

export const getPostgresUrl = (): string | undefined =>
  process.env["POSTGRES_URL"];

export const getPostgresReplicaUrl = (): string | undefined =>
  process.env["POSTGRES_REPLICA_URL"];

export const getPostgresAppName = (): string =>
  process.env["POSTGRES_APP_NAME"] ||
  `lumi-worker-${process.env["SHARDS"] ?? "0"}`;

export function getValkeyClusterNodes(): { host: string; port: number }[] | null {
  const raw = process.env["VALKEY_CLUSTER_NODES"];
  if (!raw) return null;
  const nodes = raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [host = "localhost", port] = entry.split(":");
      return { host, port: Number(port) || 6379 };
    });
  return nodes.length > 0 ? nodes : null;
}

export function getWriteBucket(streamBuckets = 16): number {
  const shards = process.env["SHARDS"];
  if (shards) {
    try {
      const parsed: unknown = JSON.parse(shards);
      const first = Array.isArray(parsed) ? parsed[0] : parsed;
      if (typeof first === "number") return first % streamBuckets;
    } catch {
      // fall through to pid
    }
  }
  return process.pid % streamBuckets;
}

export const getRpcInternalToken = (): string | null => {
  const token = process.env["RPC_INTERNAL_TOKEN"]?.trim();
  return token && token.length > 0 ? token : null;
};

export function resolveRpcDiscordBulkheadSize(): number {
  return envParseInteger("RPC_DISCORD_BULKHEAD_SIZE", 16);
}

export function resolveRpcDiscordBulkheadQueueLimit(): number {
  return envParseInteger("RPC_DISCORD_BULKHEAD_QUEUE_LIMIT", 64);
}

export const getBotToken = (): string => envParseString("BOT_TOKEN");

export type AddonSignaturePolicy = "off" | "warn" | "require";

export function getAddonSignaturePolicy(): AddonSignaturePolicy {
  const raw = process.env["ADDON_SIGNATURE_POLICY"]?.trim();
  if (!raw || raw === "off") return "off";
  if (raw === "warn" || raw === "require") return raw;
  throw new Error(
    `[ENV] Invalid ADDON_SIGNATURE_POLICY: "${raw}" (expected off, warn, or require)`,
  );
}

export function getAddonAllowedSignersFile(): string | null {
  const raw = process.env["ADDON_ALLOWED_SIGNERS_FILE"]?.trim();
  return raw && raw.length > 0 ? raw : null;
}

export function validateAddonSignatureConfig(): void {
  if (getAddonSignaturePolicy() !== "require") return;

  const file = getAddonAllowedSignersFile();
  if (!file) {
    throw new Error(
      "[ENV] ADDON_SIGNATURE_POLICY=require requires ADDON_ALLOWED_SIGNERS_FILE to be set.",
    );
  }
  if (!existsSync(file)) {
    throw new Error(
      `[ENV] ADDON_ALLOWED_SIGNERS_FILE (${file}) does not exist.`,
    );
  }
}

export function resolveAuditRetentionDays(): number {
  return envParseInteger("AUDIT_RETENTION_DAYS", 90);
}

export function resolveConfigHistoryRetentionDays(): number {
  return envParseInteger("CONFIG_HISTORY_RETENTION_DAYS", 90);
}

export function resolveModerationRetentionDays(): number {
  return envParseInteger("MODERATION_RETENTION_DAYS", 0);
}

export const getAuditArchiveDir = (): string | null => {
  const raw = process.env["AUDIT_ARCHIVE_DIR"]?.trim();
  return raw && raw.length > 0 ? raw : null;
};

export function getGdprExportDir(): string {
  return envParseString(
    "GDPR_EXPORT_DIR",
    path.join(getRepoRoot(), "data", "gdpr-exports"),
  );
}

export function resolveGdprExportTtlHours(): number {
  return envParseInteger("GDPR_EXPORT_TTL_HOURS", 24);
}

export const getGdprExportSigningSecret = (): string | null => {
  const raw = process.env["GDPR_EXPORT_SIGNING_SECRET"]?.trim();
  return raw && raw.length > 0 ? raw : null;
};

