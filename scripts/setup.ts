import { randomBytes } from "node:crypto";
import {
  chmodSync,
  existsSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { Redis } from "ioredis";
import { redisOptionsFromEnv } from "../src/core/redis.ts";

const DefaultDatabaseUrl = "postgresql://lumi:lumi@127.0.0.1:5432/lumi";
const DefaultRedisUrl = "redis://localhost:6379/0";
const PlaceholderValues: Record<string, true> = {
  "change-me": true,
  changeme: true,
  "replace-me": true,
  replace_me: true,
  "your-token": true,
  your_bot_token: true,
  your_token: true,
  xxx: true,
};

export interface SetupOptions {
  yes: boolean;
  check: boolean;
  skipMigrate: boolean;
  skipGenerate: boolean;
  skipChecks: boolean;
  startDeps: boolean;
  skipDeps: boolean;
  compose?: boolean;
  help: boolean;
  token?: string;
  owners?: string;
  databaseUrl?: string;
  redisUrl?: string;
}

export interface EnvIssue {
  key: string;
  message: string;
}

interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

export function parseArgs(argv: readonly string[]): SetupOptions {
  const options: SetupOptions = {
    yes: false,
    check: false,
    skipMigrate: false,
    skipGenerate: false,
    skipChecks: false,
    startDeps: false,
    skipDeps: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    const [flag, inlineValue] = arg.startsWith("--")
      ? arg.split("=", 2)
      : [arg, undefined];
    const takeValue = (name: string): string => {
      if (inlineValue !== undefined) return inlineValue;
      const next = argv[index + 1];
      if (next === undefined || next.startsWith("-")) {
        throw new Error(`${name} requires a value.`);
      }
      index++;
      return next;
    };

    switch (flag) {
      case "-y":
      case "--yes":
        options.yes = true;
        break;
      case "--check":
        options.check = true;
        break;
      case "--skip-migrate":
        options.skipMigrate = true;
        break;
      case "--skip-generate":
        options.skipGenerate = true;
        break;
      case "--skip-checks":
        options.skipChecks = true;
        break;
      case "--start-deps":
        options.startDeps = true;
        break;
      case "--skip-deps":
        options.skipDeps = true;
        break;
      case "--docker":
        options.compose = true;
        break;
      case "--no-docker":
        options.compose = false;
        break;
      case "-h":
      case "--help":
        options.help = true;
        break;
      case "--token":
        options.token = takeValue("--token");
        break;
      case "--owners":
        options.owners = takeValue("--owners");
        break;
      case "--database-url":
        options.databaseUrl = takeValue("--database-url");
        break;
      case "--redis-url":
        options.redisUrl = takeValue("--redis-url");
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (options.startDeps && options.skipDeps) {
    throw new Error("Use either --start-deps or --skip-deps, not both.");
  }

  return options;
}

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

export function isPlaceholder(value: string | undefined): boolean {
  const normalized = (value ?? "").trim().toLowerCase();
  return (
    normalized === "" ||
    Object.hasOwn(PlaceholderValues, normalized) ||
    normalized.startsWith("replace-") ||
    normalized.startsWith("your_") ||
    normalized.includes("your_bot_token")
  );
}

export function validateBotToken(value: string): string | null {
  const token = value.trim();
  if (token.length === 0) return "Missing bot token.";
  if (isPlaceholder(token)) {
    return "Bot token still contains a placeholder value.";
  }
  if (token.startsWith("Bot ")) {
    return 'Enter only the token, without the "Bot " prefix.';
  }
  if (/\s/.test(token)) return "Bot token must not contain whitespace.";
  if (/^mfa\.[A-Za-z0-9_-]{80,}$/.test(token)) return null;
  const parts = token.split(".");
  if (
    parts.length !== 3 ||
    parts.some((part) => part.length < 5 || !/^[A-Za-z0-9_-]+$/.test(part))
  ) {
    return "Bot token does not look like a Discord bot token (expected three dot-separated segments).";
  }
  return null;
}

export function validateOwnerIds(value: string): string | null {
  const ids = value.split(/[\s,]+/).filter(Boolean);
  if (ids.length === 0) return "Missing OWNER_IDS.";
  const invalid = ids.filter((id) => !/^\d{17,20}$/.test(id));
  if (invalid.length > 0) {
    return `OWNER_IDS must be comma-separated Discord user IDs. Invalid: ${invalid.join(", ")}`;
  }
  return null;
}

export function validateDatabaseUrl(value: string): string | null {
  if (value.trim().length === 0) return "Missing DATABASE_URL.";
  if (isPlaceholder(value)) {
    return "DATABASE_URL still contains a placeholder value.";
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "DATABASE_URL is not a valid URL.";
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    return "DATABASE_URL must start with postgres:// or postgresql://.";
  }
  if (!url.hostname) return "DATABASE_URL is missing a hostname.";
  if (url.pathname.length <= 1)
    return "DATABASE_URL is missing a database name.";
  return null;
}

export function validateRedisUrl(value: string): string | null {
  if (value.trim().length === 0) return "Missing REDIS_URL.";
  if (isPlaceholder(value)) {
    return "REDIS_URL still contains a placeholder value.";
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "REDIS_URL is not a valid URL.";
  }
  if (url.protocol !== "redis:" && url.protocol !== "rediss:") {
    return "REDIS_URL must start with redis:// or rediss://.";
  }
  if (!url.hostname) return "REDIS_URL is missing a hostname.";
  return null;
}

export function databaseUrlFrom(values: ReadonlyMap<string, string>): string {
  return values.get("DATABASE_URL") ?? "";
}

export function redisUrlFrom(values: ReadonlyMap<string, string>): string {
  const direct = values.get("REDIS_URL") ?? "";
  if (direct.length > 0) return direct;
  const host = values.get("REDIS_HOST") ?? "";
  if (host.length === 0) return "";
  const port = values.get("REDIS_PORT") ?? "6379";
  return `redis://${host}:${port}/${values.get("REDIS_DB") ?? "0"}`;
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

function mergedValues(
  values: ReadonlyMap<string, string>,
  updates: Readonly<Record<string, string>>,
): Map<string, string> {
  return new Map([...values, ...Object.entries(updates)]);
}

function envRecord(
  values: ReadonlyMap<string, string>,
): Record<string, string> {
  return Object.fromEntries(values);
}

function envForDatabase(
  values: ReadonlyMap<string, string>,
): Record<string, string> {
  return {
    ...envRecord(values),
    DATABASE_URL: databaseUrlFrom(values),
  };
}

function argumentOverrides(options: SetupOptions): Record<string, string> {
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

function environmentFallback(
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

function usage(): string {
  return `Usage: bun run setup [options]

Prepares the local environment for Lumi:
  - creates or updates .env without overwriting unrelated keys
  - generates missing Docker Compose secrets
  - checks PostgreSQL and Redis connectivity
  - runs Prisma generate and migrate deploy

Options:
  -y, --yes              Non-interactive; fail if required values are missing
      --check            Validate configuration and connectivity only
      --skip-migrate     Skip prisma migrate deploy
      --skip-generate    Skip prisma generate
      --skip-checks      Skip PostgreSQL and Redis connectivity checks
      --start-deps       Start Postgres and Redis with Docker Compose if needed
      --skip-deps        Never start Docker Compose dependencies
      --docker           Assume the bundled Docker Compose stack
      --no-docker        Assume Postgres and Redis are managed externally
      --token <token>    Discord bot token
      --owners <ids>     Comma-separated Discord user IDs
      --database-url <url>
      --redis-url <url>
  -h, --help             Show this help

Environment values already present in .env or the process environment are kept.
Secrets are never printed.`;
}

async function readVisible(
  question: string,
  defaultValue?: string,
): Promise<string> {
  const readline = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    const suffix = defaultValue ? ` [${defaultValue}]` : "";
    const answer = await readline.question(`${question}${suffix}: `);
    return answer.trim() || defaultValue || "";
  } finally {
    readline.close();
  }
}

async function readSecret(question: string): Promise<string> {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== "function") {
    return readVisible(question);
  }

  process.stdout.write(`${question}: `);
  process.stdin.setRawMode(true);
  process.stdin.resume();

  const { promise, resolve } = Promise.withResolvers<string>();
  let value = "";
  const cleanup = (): void => {
    process.stdin.off("data", onData);
    process.stdin.setRawMode(false);
    process.stdin.pause();
  };
  const onData = (chunk: Buffer): void => {
    for (const char of chunk.toString("utf8")) {
      if (char === "\r" || char === "\n") {
        cleanup();
        process.stdout.write("\n");
        resolve(value);
        return;
      }
      if (char === "\u0003") {
        cleanup();
        process.stdout.write("\n");
        process.exit(130);
      }
      if (char === "\u007f" || char === "\b") {
        if (value.length > 0) {
          value = value.slice(0, -1);
          process.stdout.write("\b \b");
        }
        continue;
      }
      if (char >= " ") {
        value += char;
        process.stdout.write("*");
      }
    }
  };
  process.stdin.on("data", onData);
  return promise;
}

async function confirm(
  question: string,
  defaultYes: boolean,
): Promise<boolean> {
  const answer = (
    await readVisible(`${question} (${defaultYes ? "Y/n" : "y/N"})`)
  ).toLowerCase();
  if (answer.length === 0) return defaultYes;
  return answer === "y" || answer === "yes";
}

function validateKey(key: string, value: string): string | null {
  switch (key) {
    case "BOT_TOKEN":
      return validateBotToken(value);
    case "OWNER_IDS":
      return validateOwnerIds(value);
    case "DATABASE_URL":
      return validateDatabaseUrl(value);
    case "REDIS_URL":
      return validateRedisUrl(value);
    default:
      return null;
  }
}

async function promptRequired(
  key: string,
  label: string,
  secret: boolean,
  defaultValue: string | undefined,
  updates: Record<string, string>,
  values: Map<string, string>,
): Promise<void> {
  for (;;) {
    const answer = secret
      ? await readSecret(label)
      : await readVisible(label, defaultValue);
    const value = answer.trim() || defaultValue || "";
    const error = validateKey(key, value);
    if (error === null) {
      updates[key] = value;
      values.set(key, value);
      return;
    }
    process.stderr.write(`  ${error}\n`);
  }
}

async function collectRequired(
  values: Map<string, string>,
  updates: Record<string, string>,
  interactive: boolean,
): Promise<EnvIssue[]> {
  const effective = mergedValues(values, updates);
  const prompts: Array<{
    key: string;
    label: string;
    secret: boolean;
    defaultValue?: string;
    missing: boolean;
  }> = [
    {
      key: "BOT_TOKEN",
      label: "Discord bot token",
      secret: true,
      missing: validateBotToken(effective.get("BOT_TOKEN") ?? "") !== null,
    },
    {
      key: "OWNER_IDS",
      label: "Your Discord user ID(s), comma separated",
      secret: false,
      missing: validateOwnerIds(effective.get("OWNER_IDS") ?? "") !== null,
    },
    {
      key: "DATABASE_URL",
      label: "PostgreSQL URL",
      secret: false,
      defaultValue: DefaultDatabaseUrl,
      missing: validateDatabaseUrl(databaseUrlFrom(effective)) !== null,
    },
    {
      key: "REDIS_URL",
      label: "Redis URL",
      secret: false,
      defaultValue: DefaultRedisUrl,
      missing:
        redisUrlFrom(effective).length === 0 ||
        validateRedisUrl(redisUrlFrom(effective)) !== null,
    },
  ];

  for (const prompt of prompts) {
    if (!prompt.missing) continue;
    const existing = effective.get(prompt.key) ?? "";
    if (prompt.key === "REDIS_URL" && (effective.get("REDIS_HOST") ?? "")) {
      continue;
    }
    if (!interactive) continue;
    process.stdout.write(`\n${prompt.label}\n`);
    if (existing.length > 0) {
      process.stdout.write(`  Current value is invalid; enter a new one.\n`);
    }
    await promptRequired(
      prompt.key,
      prompt.label,
      prompt.secret,
      prompt.defaultValue,
      updates,
      values,
    );
  }

  return validateEnv(mergedValues(values, updates));
}

async function runCommand(
  command: string,
  args: string[],
  env: Record<string, string>,
  capture: boolean,
  input?: string,
): Promise<CommandResult> {
  const proc = Bun.spawn([command, ...args], {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    stdin: input === undefined ? "ignore" : new TextEncoder().encode(input),
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const code = await proc.exited;
  if (!capture) {
    if (stdout) process.stdout.write(stdout);
    if (stderr) process.stderr.write(stderr);
  }
  return { code, stdout, stderr };
}

async function checkRedis(
  values: ReadonlyMap<string, string>,
): Promise<string | null> {
  const client = new Redis({
    ...redisOptionsFromEnv(envRecord(values)),
    lazyConnect: true,
    connectTimeout: 3_000,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
  });
  client.on("error", () => {});
  try {
    await client.connect();
    const reply = await client.ping();
    return reply === "PONG" ? null : `Unexpected PING reply: ${reply}`;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  } finally {
    client.disconnect();
  }
}

async function checkDatabase(
  values: ReadonlyMap<string, string>,
): Promise<string | null> {
  const result = await runCommand(
    "bunx",
    ["prisma", "db", "execute", "--stdin"],
    envForDatabase(values),
    true,
    "SELECT 1;\n",
  );
  if (result.code === 0) return null;
  return (
    result.stderr.trim() || result.stdout.trim() || "prisma db execute failed."
  );
}

async function waitForDependencies(
  values: ReadonlyMap<string, string>,
): Promise<{ redis: string | null; database: string | null }> {
  let redis: string | null = null;
  let database: string | null = null;
  for (let attempt = 1; attempt <= 10; attempt++) {
    redis = await checkRedis(values);
    database = await checkDatabase(values);
    if (redis === null && database === null) break;
    if (attempt < 10) {
      process.stdout.write(`  Waiting for dependencies (${attempt}/10)...\n`);
      await Bun.sleep(2_000);
    }
  }
  return { redis, database };
}

async function startComposeDeps(
  values: ReadonlyMap<string, string>,
): Promise<boolean> {
  if (!Bun.which("docker")) {
    process.stderr.write(
      "  Docker was not found. Install Docker or start PostgreSQL and Redis yourself.\n",
    );
    return false;
  }
  process.stdout.write(
    "  Starting postgres and redis with Docker Compose...\n",
  );
  const result = await runCommand(
    "docker",
    ["compose", "up", "-d", "postgres", "redis"],
    envRecord(values),
    false,
  );
  if (result.code !== 0) {
    process.stderr.write(
      "  Docker Compose could not start the dependencies.\n",
    );
    return false;
  }
  return true;
}

function printDependencyHelp(): void {
  process.stderr.write(`
Start the dependencies, then run setup again:

  docker compose up -d postgres redis
  bun run setup

Without Docker:

  PostgreSQL 18+ and Redis 8+ must be running, and DATABASE_URL / REDIS_URL
  in .env must point at them. On Debian/Ubuntu:
    sudo apt install postgresql redis-server
    sudo systemctl enable --now postgresql redis
`);
}

async function runSetup(options: SetupOptions): Promise<number> {
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return 0;
  }

  if (
    !existsSync(join(process.cwd(), "package.json")) ||
    !existsSync(join(process.cwd(), "node_modules"))
  ) {
    process.stderr.write(
      "Run setup from the Lumi repository root after `bun install`.\n",
    );
    return 1;
  }

  const interactive =
    !options.yes &&
    !options.check &&
    process.stdin.isTTY === true &&
    process.stdout.isTTY === true;
  const envPath = join(process.cwd(), ".env");
  const existingContent = existsSync(envPath)
    ? readFileSync(envPath, "utf8")
    : "";
  const fileValues = parseEnv(existingContent);
  const values = new Map(fileValues);

  const overrideUpdates = argumentOverrides(options);
  for (const [key, value] of Object.entries(overrideUpdates)) {
    values.set(key, value);
  }
  const fallbackUpdates = environmentFallback(values, [
    "BOT_TOKEN",
    "OWNER_IDS",
    "DATABASE_URL",
    "REDIS_URL",
  ]);
  for (const [key, value] of Object.entries(fallbackUpdates)) {
    values.set(key, value);
  }

  const composeAvailable =
    existsSync(join(process.cwd(), "docker-compose.yml")) &&
    Boolean(Bun.which("docker"));
  let useCompose = options.compose ?? composeAvailable;
  if (
    interactive &&
    options.compose === undefined &&
    composeAvailable &&
    !options.skipDeps
  ) {
    useCompose = await confirm(
      "Use Docker Compose for PostgreSQL and Redis?",
      true,
    );
  }

  const updates: Record<string, string> = {
    ...fallbackUpdates,
    ...applyDefaults(values, { compose: useCompose }),
    ...overrideUpdates,
  };

  process.stdout.write("\nLumi setup\n==========\n");

  const issues = await collectRequired(values, updates, interactive);
  if (issues.length > 0) {
    process.stderr.write("\nConfiguration is incomplete:\n");
    for (const issue of issues) {
      process.stderr.write(`  - ${issue.key}: ${issue.message}\n`);
    }
    process.stderr.write(
      "\nRun bun run setup interactively, or pass --token and --owners.\n",
    );
    return 1;
  }

  const effective = mergedValues(values, updates);
  const changed = Object.fromEntries(
    Object.entries(updates).filter(
      ([key, value]) => fileValues.get(key) !== value,
    ),
  );
  const pending = existsSync(envPath) ? changed : updates;

  if (Object.keys(pending).length > 0) {
    process.stdout.write("\nEnvironment changes:\n");
    for (const key of Object.keys(pending)) {
      process.stdout.write(`  - ${key}\n`);
    }
  } else {
    process.stdout.write("\nEnvironment is already up to date.\n");
  }
  process.stdout.write(
    `  Database: ${redactUrl(databaseUrlFrom(effective))}\n`,
  );
  process.stdout.write(`  Redis:    ${redactUrl(redisUrlFrom(effective))}\n`);

  if (options.check) {
    process.stdout.write("\nCheck only; no files were written.\n");
  } else if (Object.keys(pending).length > 0) {
    const content = upsertEnv(existingContent, pending);
    const temporary = `${envPath}.tmp-${process.pid}`;
    writeFileSync(temporary, content, { mode: 0o600 });
    chmodSync(temporary, 0o600);
    renameSync(temporary, envPath);
    process.stdout.write("  Wrote .env (mode 0600).\n");
  }

  if (!options.skipChecks) {
    process.stdout.write("\nChecking connectivity...\n");
    let redisError = await checkRedis(effective);
    let databaseError = await checkDatabase(effective);

    if (
      (redisError || databaseError) &&
      !options.skipDeps &&
      (options.startDeps || (interactive && useCompose))
    ) {
      const start =
        options.startDeps ||
        (await confirm(
          "Could not reach PostgreSQL or Redis. Start them with Docker Compose?",
          true,
        ));
      if (start && (await startComposeDeps(effective))) {
        const result = await waitForDependencies(effective);
        redisError = result.redis;
        databaseError = result.database;
      }
    }

    if (redisError) {
      process.stderr.write(`  Redis: ${redisError}\n`);
    } else {
      process.stdout.write("  Redis: reachable\n");
    }
    if (databaseError) {
      process.stderr.write(`  PostgreSQL: ${databaseError}\n`);
    } else {
      process.stdout.write("  PostgreSQL: reachable\n");
    }

    if (redisError || databaseError) {
      printDependencyHelp();
      return 1;
    }
  }

  if (!options.check) {
    if (!options.skipGenerate) {
      process.stdout.write("\nGenerating the Prisma client...\n");
      const result = await runCommand(
        "bunx",
        ["prisma", "generate"],
        envForDatabase(effective),
        false,
      );
      if (result.code !== 0) {
        process.stderr.write(
          "\nPrisma generate failed. Check DATABASE_URL and rerun setup.\n",
        );
        return 1;
      }
    }

    if (!options.skipMigrate) {
      process.stdout.write("\nApplying database migrations...\n");
      const result = await runCommand(
        "bunx",
        ["prisma", "migrate", "deploy"],
        envForDatabase(effective),
        false,
      );
      if (result.code !== 0) {
        process.stderr.write(
          "\nMigrations failed. Confirm DATABASE_URL points at an empty or existing Lumi database and that the database user can create tables.\n",
        );
        return 1;
      }
    }
  }

  process.stdout.write(`
Setup complete.

Next steps:
  1. Invite the bot with the bot and applications.commands scopes.
  2. Enable the Server Members, Message Content, and Presence intents.
  3. Start the bot:  bun run dev:bot
     Docker:        docker compose up -d bot
  4. In Discord, run /lumi as a server admin to enable modules.
`);
  return 0;
}

async function main(): Promise<void> {
  try {
    const code = await runSetup(parseArgs(process.argv.slice(2)));
    process.exitCode = code;
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n\n${usage()}\n`,
    );
    process.exitCode = 1;
  }
}

if (import.meta.main) {
  void main();
}
