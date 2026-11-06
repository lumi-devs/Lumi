import { randomBytes } from "node:crypto";
import { databaseUrlFrom, validateDatabaseUrl } from "./database.ts";
import { validateBotToken, validateOwnerIds } from "./discord.ts";
import { redisUrlFrom, validateRedisUrl } from "./redis.ts";
import {
  DefaultDatabaseUrl,
  DefaultRedisUrl,
  type EnvIssue,
  isPlaceholder,
  type SetupOptions,
} from "./shared.ts";

function parseEnvValue(raw: string): string {
  const value = raw.trim();
  if (value.startsWith('"')) {
    let output = "";
    for (let index = 1; index < value.length; index++) {
      const char = value[index];
      if (char === "\\") {
        const next = value[index + 1];
        if (next === "n") output += "\n";
        else if (next === "r") output += "\r";
        else if (next === "t") output += "\t";
        else if (next !== undefined) output += next;
        index++;
        continue;
      }
      if (char === '"') return output;
      output += char;
    }
    return output;
  }
  if (value.startsWith("'")) {
    const end = value.indexOf("'", 1);
    return end === -1 ? value.slice(1) : value.slice(1, end);
  }
  return value.replace(/\s+#.*$/, "").trim();
}

export function parseEnv(content: string): Map<string, string> {
  const values = new Map<string, string>();
  for (const line of content.split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(
      line,
    );
    if (!match) continue;
    values.set(match[1], parseEnvValue(match[2]));
  }
  return values;
}

export function formatEnvValue(value: string): string {
  if (value === "") return "";
  if (/^[A-Za-z0-9_./:@,+%-]+$/.test(value)) return value;
  return JSON.stringify(value);
}

export function upsertEnv(
  content: string,
  updates: Readonly<Record<string, string>>,
): string {
  const remaining = new Map(Object.entries(updates));
  if (remaining.size === 0) return content;

  const lines = content.length > 0 ? content.split(/\r?\n/) : [];
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();

  const output: string[] = [];
  for (const line of lines) {
    const match =
      /^(\s*(?:export\s+)?)([A-Za-z_][A-Za-z0-9_]*)(\s*=\s*)(.*)$/.exec(line);
    if (!match) {
      output.push(line);
      continue;
    }
    const value = remaining.get(match[2]);
    if (value === undefined) {
      output.push(line);
      continue;
    }
    output.push(`${match[1]}${match[2]}${match[3]}${formatEnvValue(value)}`);
    remaining.delete(match[2]);
  }

  if (remaining.size > 0) {
    if (output.length > 0 && output[output.length - 1].trim() !== "") {
      output.push("");
    }
    for (const [key, value] of remaining) {
      output.push(`${key}=${formatEnvValue(value)}`);
    }
  }

  return `${output.join("\n")}\n`;
}

export function validateEnv(values: ReadonlyMap<string, string>): EnvIssue[] {
  const issues: EnvIssue[] = [];
  const tokenError = validateBotToken(values.get("BOT_TOKEN") ?? "");
  if (tokenError) issues.push({ key: "BOT_TOKEN", message: tokenError });

  const ownerError = validateOwnerIds(values.get("OWNER_IDS") ?? "");
  if (ownerError) issues.push({ key: "OWNER_IDS", message: ownerError });

  const databaseError = validateDatabaseUrl(databaseUrlFrom(values));
  if (databaseError) {
    issues.push({ key: "DATABASE_URL", message: databaseError });
  }

  const redisUrl = redisUrlFrom(values);
  if (redisUrl.length === 0) {
    issues.push({
      key: "REDIS_URL",
      message: "Set REDIS_URL or REDIS_HOST.",
    });
  } else {
    const redisError = validateRedisUrl(redisUrl);
    if (redisError) issues.push({ key: "REDIS_URL", message: redisError });
  }

  const metricsPort = values.get("METRICS_PORT");
  if (metricsPort) {
    const port = Number(metricsPort);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      issues.push({
        key: "METRICS_PORT",
        message: "METRICS_PORT must be an integer between 1 and 65535.",
      });
    }
  }

  return issues;
}

export interface DefaultOptions {
  compose: boolean;
  generateSecret?: () => string;
}

function generatedSecret(): string {
  return randomBytes(32).toString("base64url");
}

export function applyDefaults(
  values: ReadonlyMap<string, string>,
  options: DefaultOptions,
): Record<string, string> {
  const generate = options.generateSecret ?? generatedSecret;
  const updates: Record<string, string> = {};
  const setDefault = (key: string, value: string): void => {
    if (isPlaceholder(values.get(key))) updates[key] = value;
  };

  setDefault("LOG_LEVEL", "info");
  setDefault("CACHE_NAMESPACE", "lumi");
  setDefault("METRICS_PORT", "9090");
  setDefault("DEFAULT_PREFIX", ",");

  let databaseUrl = databaseUrlFrom(values);
  if (isPlaceholder(databaseUrl)) {
    databaseUrl = DefaultDatabaseUrl;
    updates.DATABASE_URL = databaseUrl;
  }

  let redisUrl = redisUrlFrom(values);
  if (isPlaceholder(redisUrl)) {
    redisUrl = DefaultRedisUrl;
    updates.REDIS_URL = redisUrl;
  }

  if (options.compose) {
    if (isPlaceholder(values.get("POSTGRES_PASSWORD"))) {
      updates.POSTGRES_PASSWORD = generate();
    }
    if (validateRedisUrl(redisUrl) === null) {
      const parsed = new URL(redisUrl);
      const fromUrl = parsed.password
        ? decodeURIComponent(parsed.password)
        : "";
      let password = fromUrl || (values.get("REDIS_PASSWORD") ?? "");
      if (isPlaceholder(password)) password = generate();
      if (values.get("REDIS_PASSWORD") !== password) {
        updates.REDIS_PASSWORD = password;
      }
      if (!parsed.password) {
        parsed.password = password;
        redisUrl = parsed.toString();
        updates.REDIS_URL = redisUrl;
      }
    }
    if (isPlaceholder(values.get("RPC_INTERNAL_TOKEN"))) {
      updates.RPC_INTERNAL_TOKEN = generate();
    }
  }

  return updates;
}

export function redactUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.username) url.username = "***";
    if (url.password) url.password = "***";
    return url.toString();
  } catch {
    return value;
  }
}

export function argumentOverrides(
  options: SetupOptions,
): Record<string, string> {
  const updates: Record<string, string> = {};
  if (options.token !== undefined) updates.BOT_TOKEN = options.token.trim();
  if (options.owners !== undefined) updates.OWNER_IDS = options.owners.trim();
  if (options.databaseUrl !== undefined) {
    updates.DATABASE_URL = options.databaseUrl.trim();
  }
  if (options.redisUrl !== undefined)
    updates.REDIS_URL = options.redisUrl.trim();
  return updates;
}

export function environmentFallback(
  values: ReadonlyMap<string, string>,
  keys: readonly string[],
): Record<string, string> {
  const updates: Record<string, string> = {};
  for (const key of keys) {
    if (values.has(key)) continue;
    const current = process.env[key];
    if (current !== undefined && current.trim().length > 0) {
      updates[key] = current.trim();
    }
  }
  return updates;
}
