// Shared data builders for the docs export pipeline. Each `build*` function
// reads real source (module manifests, permit-node vocabulary, the RPC
// contract, env var readers, command decorators, and the addon SDK surface)
// and returns plain data — no file writes here. `export.ts` serializes the
// results to JSON for the docs site; `check.ts` calls only `buildEnvVars()`
// to run the env-var drift check without writing anything.

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import * as rpcContract from "@lumi/contracts/rpc";

export const REPO_ROOT = path.resolve(fileURLToPath(new URL("../../", import.meta.url)));

const MODULE_NAMES = [
  "afk", "core", "dashboard", "economy", "filter", "logging", "mod",
  "reactionroles", "security", "tempvc", "utility", "welcome",
] as const;

interface Manifest {
  name: string;
  displayName: string;
  emoji: string;
  description: string;
  short: string;
  endUserDataStatement?: string;
  disableable: boolean;
  category: string;
  configFields: {
    key: string;
    type: string;
    label: string;
    description: string;
    group?: string;
    default?: unknown;
  }[];
}

export async function loadManifests(): Promise<Manifest[]> {
  const manifests: Manifest[] = [];
  for (const name of MODULE_NAMES) {
    const p = path.join(REPO_ROOT, "packages/core/src/modules", name, "manifest.json");
    const raw = await fs.readFile(p, "utf8");
    manifests.push(JSON.parse(raw) as Manifest);
  }
  return manifests;
}

// --- 1. Modules -------------------------------------------------------------

export interface ModuleSummary {
  name: string;
  displayName: string;
  emoji: string;
  description: string;
  short: string;
  category: string;
  disableable: boolean;
  configFieldCount: number;
}

export function buildModules(manifests: Manifest[]): ModuleSummary[] {
  return manifests.map((m) => ({
    name: m.name,
    displayName: m.displayName,
    emoji: m.emoji,
    description: m.description,
    short: m.short,
    category: m.category,
    disableable: m.disableable,
    configFieldCount: m.configFields.length,
  }));
}

// --- 2. Data and privacy -----------------------------------------------------

export interface DataPrivacyRow {
  name: string;
  displayName: string;
  /** null when the module's manifest.json declares no endUserDataStatement. */
  statement: string | null;
}

export function buildDataPrivacy(manifests: Manifest[]): DataPrivacyRow[] {
  return manifests.map((m) => ({
    name: m.name,
    displayName: m.displayName,
    statement: m.endUserDataStatement ?? null,
  }));
}

// --- 3. Permit nodes ----------------------------------------------------------

export interface PermitNodeGroup {
  prefix: string;
  nodes: string[];
}

export async function buildPermits(): Promise<{ permitNodeGroups: PermitNodeGroup[]; permitNodeCount: number }> {
  const mod = await import(path.join(REPO_ROOT, "packages/contracts/src/permit-nodes.ts"));
  const permitNodeGroups = mod.KnownPermitNodeGroups as PermitNodeGroup[];
  const permitNodeCount = permitNodeGroups.reduce((total, group) => total + group.nodes.length, 0);
  return { permitNodeGroups, permitNodeCount };
}

// --- 4. Environment variables --------------------------------------------------
// env.ts has no single schema object to import — it's a bag of
// functions/getters reading process.env["KEY"] ad hoc. Real generation of
// names is possible (regex-scan for the literal reads); the
// required/default/description columns cannot be extracted from source
// without a lot of bespoke parsing for marginal gain, so they stay a
// hand-maintained lookup here, and the builder fails the build if a scanned
// key has no lookup entry or a lookup entry no longer matches a scanned key.
//
// The dashboard's own env vars (dashboardMeta below) can't get that drift
// check: its source (src/lib/env.ts) lives in the separate lumi-dashboard
// repo, so there's nothing here to scan. dashboardMeta stays a plain
// hand-maintained table — keep it in sync by hand when that repo's env.ts
// changes.

export interface EnvRow {
  name: string;
  required: string;
  fallback: string;
  about: string;
}

interface EnvMeta {
  required: string;
  fallback: string;
  about: string;
}

const workerMeta: Record<string, EnvMeta> = {
  BOT_TOKEN: { required: "yes", fallback: "—", about: "Discord bot token. The worker refuses to start without it." },
  TOTAL_SHARDS: { required: "no", fallback: "auto", about: "Shard count for the ShardingManager, or auto to let Discord decide." },
  SHARD_LIST: { required: "no", fallback: "auto", about: "Comma-separated shard ids this deployment owns, or auto." },
  POSTGRES_URL: { required: "yes", fallback: "—", about: "Primary Postgres connection string (point it at PgBouncer in Compose)." },
  POSTGRES_REPLICA_URL: { required: "no", fallback: "—", about: "Optional read-replica connection string." },
  POSTGRES_APP_NAME: { required: "no", fallback: "lumi-worker-<shards>", about: "application_name reported to Postgres per process." },
  POSTGRES_POOL_MAX: { required: "no", fallback: "derived", about: "Explicit per-process pool size. Wins over the budget below." },
  POSTGRES_POOL_TOTAL: { required: "no", fallback: "80", about: "Fleet-wide connection budget, divided across shards so scaling out never exhausts max_connections." },
  DIRECT_POSTGRES_URL: { required: "no", fallback: "—", about: "Direct Postgres URL used by migrations, bypassing PgBouncer." },
  REDIS_HOST: { required: "no", fallback: "127.0.0.1", about: "Standalone/sentinel Redis host." },
  REDIS_PORT: { required: "no", fallback: "6379", about: "Standalone/sentinel Redis port." },
  REDIS_PASSWORD: { required: "no", fallback: "—", about: "Redis password." },
  REDIS_CACHE_DB: { required: "no", fallback: "—", about: "Logical database index for cache data." },
  REDIS_TASK_DB: { required: "no", fallback: "—", about: "Logical database index for scheduled-task data." },
  REDIS_SENTINELS: { required: "no", fallback: "—", about: "Sentinel addresses when running Redis in sentinel mode." },
  REDIS_SENTINEL_NAME: { required: "no", fallback: "—", about: "Sentinel master name." },
  REDIS_SENTINEL_PASSWORD: { required: "no", fallback: "—", about: "Sentinel password." },
  REDIS_CLUSTER_NODES: { required: "no", fallback: "—", about: "Comma-separated host:port list enabling cluster mode." },
  REDIS_CLUSTER_SCALE_READS: { required: "no", fallback: "master", about: "Read scaling policy: master, slave, or all." },
  REDIS_CLUSTER_SLOTS_REFRESH_TIMEOUT_MS: { required: "no", fallback: "2000", about: "Slot-refresh timeout for the cluster client." },
  RPC_HTTP_HOST: { required: "no", fallback: "127.0.0.1", about: "Bind for the worker RPC/metrics surface. Widened to 0.0.0.0 only on the container the dashboard calls." },
  RPC_HTTP_PORT: { required: "no", fallback: "8091", about: "Port for the worker RPC/metrics surface." },
  RPC_INTERNAL_TOKEN: { required: "yes", fallback: "—", about: "Shared secret authenticating dashboard-to-worker RPC. Unset is a hard failure." },
  RPC_HTTP_URL: { required: "no", fallback: "—", about: "Base URL of the api RPC server, read only by `lumi doctor` to check reachability." },
  RPC_DISCORD_BULKHEAD_SIZE: { required: "no", fallback: "16", about: "Max concurrent guild-manager RPC actions (each makes a Discord REST permission check), so a Discord stall can't starve DB-only actions." },
  RPC_DISCORD_BULKHEAD_QUEUE_LIMIT: { required: "no", fallback: "64", about: "Guild-manager RPC calls allowed to wait for a bulkhead slot before new ones fail with a retryable error." },
  OWNER_IDS: { required: "no", fallback: "—", about: "Extra bot-owner ids recognized by the permit resolver (the Discord application owner is always an owner)." },
  LUMI_CONSUMER_ID: { required: "no", fallback: "hostname / pid", about: "Stable consumer identity for stream processing." },
  CLUSTER_NAME: { required: "no", fallback: "default", about: "Namespaces shard telemetry per replica for the fleet view." },
  LUMI_DEV_PATHS: { required: "no", fallback: "—", about: "Colon/comma-separated extra module directories for local add-on development. Never set in production." },
  DISCORD_PROXY_URL: { required: "no", fallback: "—", about: "Shared outbound REST proxy root (nirn-proxy). Unset means direct Discord API calls." },
  DASHBOARD_PUBLIC_URL: { required: "no", fallback: "—", about: "Public dashboard origin used to build appeal links. Unset skips appeal links." },
  NODE_ENV: { required: "no", fallback: "development", about: "Runtime environment flag." },
  SHARD_COUNT: { required: "no", fallback: "1", about: "Injected by the ShardingManager; do not set yourself." },
  SHARDS: { required: "no", fallback: "—", about: "Injected by the ShardingManager as this process's shard id list; do not set yourself." },
  SHARDING_MANAGER: { required: "no", fallback: "—", about: "Injected by the ShardingManager to mark a child process; do not set yourself." },
  HOSTNAME: { required: "no", fallback: "container hostname", about: "Used as a consumer-id fallback; normally set by the container runtime, not you." },
  CACHE_MESSAGE_LIMIT: { required: "no", fallback: "50", about: "Max cached messages per channel." },
  CACHE_MEMBER_LIMIT: { required: "no", fallback: "50", about: "Max cached guild members per guild." },
  CACHE_THREAD_LIMIT: { required: "no", fallback: "25", about: "Max cached threads per channel." },
  CACHE_USER_LIMIT: { required: "no", fallback: "200", about: "Max cached users." },
  SWEEPER_MESSAGES_INTERVAL: { required: "no", fallback: "300", about: "Seconds between message-cache sweeps." },
  SWEEPER_MESSAGES_LIFETIME: { required: "no", fallback: "600", about: "Seconds a cached message survives before being swept." },
  SWEEPER_MEMBERS_INTERVAL: { required: "no", fallback: "1800", about: "Seconds between guild-member-cache sweeps." },
  SWEEPER_MEMBERS_LIFETIME: { required: "no", fallback: "1800", about: "Seconds a cached non-self member survives before being swept." },
  DEFAULT_PREFIX: { required: "no", fallback: ",", about: "Legacy text-command prefix." },
  SERVICE_NAME: { required: "no", fallback: "lumi", about: "Service name reported to the logger and observability exporters." },
  DB_SLOW_QUERY_THRESHOLD_MS: { required: "no", fallback: "1000", about: "Prisma queries slower than this log a warning and increment lumi_db_slow_queries_total." },
  ADDON_SIGNATURE_POLICY: { required: "no", fallback: "off", about: "How strictly the Downloader enforces git SSH commit-signature verification before an addon repo/module revision goes live: off, warn, or require." },
  ADDON_ALLOWED_SIGNERS_FILE: { required: "no", fallback: "—", about: "Path to a git allowed_signers file listing trusted addon signers. Required (and validated to exist) when ADDON_SIGNATURE_POLICY=require." },
  AUDIT_RETENTION_DAYS: { required: "no", fallback: "90", about: "How long audit ledger entries survive before the retention sweep purges them." },
  CONFIG_HISTORY_RETENTION_DAYS: { required: "no", fallback: "90", about: "How long module config history entries survive before the retention sweep purges them." },
  MODERATION_RETENTION_DAYS: { required: "no", fallback: "0 (keep forever)", about: "How long a lifted case and its resolved appeal survive before the retention sweep purges them. 0 keeps moderation history forever; active cases and pending appeals are never purged regardless of this setting." },
  AUDIT_ARCHIVE_DIR: { required: "no", fallback: "—", about: "Root directory the retention sweep writes a gzip-compressed JSONL archive to before deleting a batch, for any purged table (not just the audit ledger). Unset deletes with no backup." },
};

const dashboardMeta: Record<string, EnvMeta> = {
  DASHBOARD_HOST: { required: "no", fallback: "0.0.0.0", about: "Interface the dashboard binds." },
  DASHBOARD_PORT: { required: "no", fallback: "8080", about: "Port the dashboard listens on." },
  DASHBOARD_PUBLIC_URL: { required: "no", fallback: "\"\"", about: "Public origin of the dashboard (e.g. https://dash.example.com) for post-invite OAuth2 redirects." },
  DASHBOARD_SESSION_SECRET: { required: "yes", fallback: "—", about: "NextAuth session JWT encryption secret." },
  DISCORD_OAUTH2_CLIENT_ID: { required: "yes", fallback: "—", about: "Discord application client id." },
  DISCORD_OAUTH2_CLIENT_SECRET: { required: "yes", fallback: "—", about: "Discord application client secret." },
  RPC_HTTP_URL: { required: "yes", fallback: "—", about: "Base URL of the worker RPC server, e.g. http://worker:8091." },
  RPC_INTERNAL_TOKEN: { required: "no", fallback: "\"\"", about: "Shared secret sent as the RPC bearer token. Must match the worker's value; optional only so a local dev worker without the token still works." },
  TRUSTED_PROXY_HOPS: { required: "no", fallback: "1", about: "Number of trusted reverse-proxy hops when reading the client IP." },
  CLIENT_IP_HEADER: { required: "no", fallback: "—", about: "Header to trust for the client IP behind a reverse proxy." },
  AUTH_URL: { required: "proxy only", fallback: "—", about: "Externally visible origin when a reverse proxy rewrites Host." },
  NEXT_PHASE: { required: "no", fallback: "—", about: "Set by Next.js itself during `next build`; not something you set." },
  NODE_ENV: { required: "no", fallback: "development", about: "Runtime environment flag." },
};

/**
 * Regex-scan for every env var literal actually read in a file — direct
 * `process.env["KEY"]` reads, plus this file's own thin parser helpers
 * (`envParseString`/`envParseInteger`/`envStr`/`envInt`), which take the key
 * as their first string-literal argument rather than indexing `process.env`
 * directly.
 */
async function scanEnvKeys(file: string): Promise<Set<string>> {
  const src = await fs.readFile(file, "utf8");
  const keys = new Set<string>();
  for (const m of src.matchAll(/process\.env\[["']([A-Z0-9_]+)["']\]/g)) {
    keys.add(m[1]!);
  }
  for (const m of src.matchAll(/process\.env\.([A-Z0-9_]+)\b/g)) {
    keys.add(m[1]!);
  }
  for (const m of src.matchAll(/\benv(?:ParseString|ParseInteger|Str|Int)\(\s*["']([A-Z0-9_]+)["']/g)) {
    keys.add(m[1]!);
  }
  return keys;
}

function toRows(meta: Record<string, EnvMeta>): EnvRow[] {
  return Object.entries(meta).map(([name, m]) => ({ name, ...m }));
}

// Worker env vars aren't confined to env.ts — the Redis client, RPC HTTP
// server, and permit resolver each read a few of their own directly.
const WORKER_ENV_FILES = [
  "packages/core/src/lib/env.ts",
  "packages/core/src/lib/database/redis.ts",
  "apps/api/src/rpc-http-server.ts",
  "packages/core/src/lib/permissions/PermitResolver.ts",
  "packages/core/src/lib/client/client-options.ts",
  "packages/core/src/lib/client/scheduled-tasks-queue.ts",
  "prisma.config.ts",
];

export interface EnvVarsResult {
  workerEnvVars: EnvRow[];
  dashboardEnvVars: EnvRow[];
  observabilityEnvVars: EnvRow[];
  composeEnvVars: EnvRow[];
}

export async function buildEnvVars(): Promise<EnvVarsResult> {
  const workerScanned = new Set<string>();
  for (const file of WORKER_ENV_FILES) {
    for (const key of await scanEnvKeys(path.join(REPO_ROOT, file))) workerScanned.add(key);
  }

  const problems: string[] = [];
  for (const key of workerScanned) {
    if (!(key in workerMeta)) problems.push(`a worker env source file reads ${key}, which has no docs metadata`);
  }
  for (const key of Object.keys(workerMeta)) {
    if (!workerScanned.has(key)) problems.push(`docs metadata for ${key} has no matching process.env read in ${WORKER_ENV_FILES.join(", ")}`);
  }
  if (problems.length > 0) {
    throw new Error(`Environment variable reference drifted from source:\n  ${problems.join("\n  ")}`);
  }

  // Compose-only and observability vars are consumed by docker-compose.yml /
  // packages/observability rather than a single scannable TS file; kept as a
  // plain hand-maintained table with no automated drift check.
  const observabilityEnvVars: EnvRow[] = [
    { name: "OTEL_ENABLED", required: "no", fallback: "true", about: "Enable OpenTelemetry tracing." },
    { name: "OTEL_EXPORTER_OTLP_ENDPOINT", required: "no", fallback: "collector:4318", about: "OTLP endpoint traces are exported to." },
    { name: "OTEL_TRACES_SAMPLE_RATIO", required: "no", fallback: "1", about: "Trace sampling ratio." },
    { name: "OTEL_DIAG", required: "no", fallback: "—", about: "OpenTelemetry diagnostics flag." },
    { name: "METRICS_ENABLED", required: "no", fallback: "true", about: "Serve /healthz, /readyz, and /metrics." },
    { name: "METRICS_HOST", required: "no", fallback: "—", about: "Bind for the telemetry server." },
    { name: "METRICS_PORT", required: "no", fallback: "9090", about: "Port for the telemetry server." },
    { name: "LOG_FORMAT", required: "no", fallback: "json", about: "Log encoding: json in Compose, pretty in the dev container." },
    { name: "LOG_LEVEL", required: "no", fallback: "info", about: "Minimum log level." },
  ];
  const composeEnvVars: EnvRow[] = [
    { name: "POSTGRES_USER", required: "no", fallback: "lumi", about: "Postgres superuser name created at init." },
    { name: "POSTGRES_PASSWORD", required: "no", fallback: "lumi", about: "Postgres password. Change it in any shared deployment." },
    { name: "GRAFANA_USER", required: "no", fallback: "admin", about: "Grafana admin username (observability profile)." },
    { name: "GRAFANA_PASSWORD", required: "yes*", fallback: "—", about: "*Required only under the observability profile. No default on purpose." },
    { name: "NIRN_LOG_LEVEL", required: "no", fallback: "info", about: "Log level for the nirn outbound proxy (scale profile)." },
  ];

  return {
    workerEnvVars: toRows(workerMeta),
    dashboardEnvVars: toRows(dashboardMeta),
    observabilityEnvVars,
    composeEnvVars,
  };
}

// --- 5. RPC actions -----------------------------------------------------------

export interface RpcActionRow {
  name: string;
  auth: string;
  timeoutMs: number;
  requiresEnabled: string | null;
  summary: string;
}

export interface RpcSliceGroup {
  slice: string;
  actions: RpcActionRow[];
}

export function buildRpcActions(): { rpcActions: RpcActionRow[]; rpcActionCount: number; rpcSliceGroups: RpcSliceGroup[] } {
  const { rpcRouter } = rpcContract;

  const rpcActions = Object.entries(rpcRouter)
    .map(([name, entry]) => ({
      name,
      auth: entry.auth,
      timeoutMs: entry.timeoutMs,
      requiresEnabled: entry.requiresEnabled ?? null,
      summary: entry.summary,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  type RpcSlice = Record<string, { auth: string; timeoutMs: number; requiresEnabled?: string; summary: string }>;
  const sliceEntries = Object.entries(rpcContract as Record<string, unknown>).filter(
    (entry) => entry[0].endsWith("Rpc") && entry[0] !== "rpcRouter" && typeof entry[1] === "object" && entry[1] !== null,
  ) as [string, RpcSlice][];

  if (sliceEntries.length === 0) {
    throw new Error("found no *Rpc slice exports on @lumi/contracts/rpc");
  }

  const rpcSliceGroups = sliceEntries
    .map(([exportName, slice]) => ({
      slice: exportName.replace(/Rpc$/, ""),
      actions: Object.entries(slice)
        .map(([name, entry]) => ({
          name,
          auth: entry.auth,
          timeoutMs: entry.timeoutMs,
          requiresEnabled: entry.requiresEnabled ?? null,
          summary: entry.summary,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => a.slice.localeCompare(b.slice));

  return { rpcActions, rpcActionCount: rpcActions.length, rpcSliceGroups };
}

// --- 6. Commands ----------------------------------------------------------------

export interface CommandRow {
  module: string;
  name: string;
  description: string;
  requiredPermit: string | null;
  subcommands: string[];
}

export interface CommandGroup {
  module: string;
  displayName: string;
  emoji: string;
  commands: CommandRow[];
}

/** Extracts the balanced `{ ... }` object literal that follows `@ApplyOptions<...>(`. */
function extractApplyOptionsBlocks(src: string): string[] {
  const blocks: string[] = [];
  const marker = "@ApplyOptions<";
  let searchFrom = 0;
  for (;;) {
    const markerIdx = src.indexOf(marker, searchFrom);
    if (markerIdx === -1) break;
    const openParen = src.indexOf("(", markerIdx);
    const openBrace = src.indexOf("{", openParen);
    if (openParen === -1 || openBrace === -1) break;
    let depth = 0;
    let i = openBrace;
    for (; i < src.length; i++) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}") {
        depth--;
        if (depth === 0) break;
      }
    }
    blocks.push(src.slice(openBrace, i + 1));
    searchFrom = i + 1;
  }
  return blocks;
}

function firstMatch(block: string, re: RegExp): string | null {
  const m = block.match(re);
  return m ? m[1]! : null;
}

export async function buildCommands(manifests: Manifest[]): Promise<{ commandGroups: CommandGroup[]; commandCount: number }> {
  const byModule = new Map(manifests.map((m) => [m.name, m]));
  const commands: CommandRow[] = [];

  for (const moduleName of MODULE_NAMES) {
    const dir = path.join(REPO_ROOT, "packages/core/src/modules", moduleName, "commands");
    let files: string[];
    try {
      files = (await fs.readdir(dir)).filter((f) => f.endsWith(".ts"));
    } catch {
      continue;
    }
    for (const file of files) {
      const src = await fs.readFile(path.join(dir, file), "utf8");
      for (const block of extractApplyOptionsBlocks(src)) {
        const name = firstMatch(block, /name:\s*"([^"]+)"/);
        const description = firstMatch(block, /description:\s*"((?:[^"\\]|\\.)*)"/);
        if (!name || !description) continue;
        const requiredPermit = firstMatch(block, /requiredPermit:\s*"([^"]+)"/);
        const subcommandsBlock = block.match(/subcommands:\s*\[([\s\S]*?)\]/);
        const subcommands = subcommandsBlock
          ? [...subcommandsBlock[1]!.matchAll(/name:\s*"([^"]+)"/g)].map((m) => m[1]!)
          : [];
        commands.push({
          module: moduleName,
          name,
          description: description.replace(/\\"/g, '"'),
          requiredPermit,
          subcommands,
        });
      }
    }
  }

  if (commands.length === 0) {
    throw new Error("parsed zero commands out of packages/core/src/modules/*/commands — the extractor likely no longer matches the source shape.");
  }

  commands.sort((a, b) => a.module.localeCompare(b.module) || a.name.localeCompare(b.name));

  const commandGroups = MODULE_NAMES.map((name) => {
    const manifest = byModule.get(name)!;
    return {
      module: name,
      displayName: manifest.displayName,
      emoji: manifest.emoji,
      commands: commands.filter((c) => c.module === name),
    };
  }).filter((g) => g.commands.length > 0);

  return { commandGroups, commandCount: commands.length };
}

// --- 7. Addon SDK reference ------------------------------------------------------

export interface SdkExportEntry {
  name: string;
  kind: string;
  signature: string;
  summary: string;
}

export interface SdkImportGroup {
  importPath: string;
  file: string;
  exports: SdkExportEntry[];
}

async function resolveEntryPoints(): Promise<{ importPath: string; file: string }[]> {
  const raw = await fs.readFile(path.join(REPO_ROOT, "package.json"), "utf8");
  const pkg = JSON.parse(raw) as { exports?: Record<string, string> };
  const exportsMap = pkg.exports ?? {};
  const entries: { importPath: string; file: string }[] = [];
  const sdkPrefix = "./packages/core/src/lib/addon-sandbox/sdk/";
  for (const [subpath, relFile] of Object.entries(exportsMap)) {
    if (typeof relFile !== "string" || !relFile.startsWith(sdkPrefix)) continue;
    const importPath = subpath === "." ? "lumi" : `lumi/${subpath.slice(2)}`;
    entries.push({ importPath, file: path.join(REPO_ROOT, relFile.slice(2)) });
  }
  entries.sort((a, b) => a.importPath.localeCompare(b.importPath));
  return entries;
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  return ts.canHaveModifiers(node) && (ts.getModifiers(node)?.some((m) => m.kind === kind) ?? false);
}

function isPublicMember(member: ts.ClassElement): boolean {
  if (hasModifier(member, ts.SyntaxKind.PrivateKeyword)) return false;
  if (hasModifier(member, ts.SyntaxKind.ProtectedKeyword)) return false;
  if (ts.isPropertyDeclaration(member) && ts.isPrivateIdentifier(member.name)) return false;
  if (ts.isMethodDeclaration(member) && ts.isPrivateIdentifier(member.name)) return false;
  return true;
}

function memberName(member: ts.ClassElement): string | null {
  if (ts.isConstructorDeclaration(member)) return "constructor";
  const name = (member as { name?: ts.PropertyName }).name;
  if (!name) return null;
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text;
  return null;
}

function classSignature(checker: ts.TypeChecker, decl: ts.ClassLikeDeclaration, name: string): string {
  const isAbstract = hasModifier(decl, ts.SyntaxKind.AbstractKeyword);
  const lines = [`${isAbstract ? "abstract " : ""}class ${name} {`];
  for (const member of decl.members) {
    if (!isPublicMember(member)) continue;
    const label = memberName(member);
    if (label === null) continue;
    const readonly = hasModifier(member, ts.SyntaxKind.ReadonlyKeyword) ? "readonly " : "";
    const abstractPrefix = hasModifier(member, ts.SyntaxKind.AbstractKeyword) ? "abstract " : "";
    if (
      ts.isMethodDeclaration(member) ||
      ts.isMethodSignature(member) ||
      ts.isConstructorDeclaration(member)
    ) {
      const sig = checker.getSignatureFromDeclaration(member);
      const sigText = sig ? checker.signatureToString(sig, member) : "()";
      lines.push(`  ${abstractPrefix}${label}${sigText};`);
    } else if (
      ts.isPropertyDeclaration(member) ||
      ts.isPropertySignature(member) ||
      ts.isGetAccessorDeclaration(member)
    ) {
      const type = checker.getTypeAtLocation(member);
      const typeText = checker.typeToString(type, member, ts.TypeFormatFlags.NoTruncation);
      lines.push(`  ${readonly}${label}: ${typeText};`);
    }
  }
  lines.push("}");
  return lines.join("\n");
}

const MaxSignatureLength = 400;

function trimSignature(text: string): string {
  return text.length > MaxSignatureLength ? `${text.slice(0, MaxSignatureLength)}…` : text;
}

function printerFor(sourceFile: ts.SourceFile): (node: ts.Node) => string {
  const printer = ts.createPrinter({ removeComments: true, newLine: ts.NewLineKind.LineFeed });
  return (node) => printer.printNode(ts.EmitHint.Unspecified, node, sourceFile);
}

function describeExport(
  checker: ts.TypeChecker,
  name: string,
  symbol: ts.Symbol,
  sourceFile: ts.SourceFile,
): SdkExportEntry | null {
  const resolved = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
  const decl = resolved.valueDeclaration ?? resolved.declarations?.[0];
  if (!decl) return null;

  const docSource = symbol.getDocumentationComment(checker).length ? symbol : resolved;
  const summary = ts.displayPartsToString(docSource.getDocumentationComment(checker)).trim();
  const print = printerFor(decl.getSourceFile() ?? sourceFile);

  if (ts.isFunctionDeclaration(decl)) {
    const sig = checker.getSignatureFromDeclaration(decl);
    const sigText = sig ? checker.signatureToString(sig, decl) : "()";
    return { name, kind: "function", signature: trimSignature(`function ${name}${sigText}`), summary };
  }
  if (ts.isClassDeclaration(decl)) {
    return { name, kind: "class", signature: classSignature(checker, decl, name), summary };
  }
  if (ts.isInterfaceDeclaration(decl)) {
    return { name, kind: "interface", signature: print(decl).trim(), summary };
  }
  if (ts.isTypeAliasDeclaration(decl)) {
    return { name, kind: "type", signature: print(decl).trim(), summary };
  }
  if (ts.isEnumDeclaration(decl)) {
    return { name, kind: "enum", signature: print(decl).trim(), summary };
  }
  if (ts.isVariableDeclaration(decl)) {
    const type = checker.getTypeOfSymbolAtLocation(resolved, decl);
    const typeText = checker.typeToString(type, decl);
    return { name, kind: "const", signature: trimSignature(`const ${name}: ${typeText}`), summary };
  }
  if (ts.isModuleDeclaration(decl)) {
    return { name, kind: "namespace", signature: print(decl).trim(), summary };
  }
  return { name, kind: "value", signature: name, summary };
}

export async function buildSdkReference(): Promise<{ sdkImportGroups: SdkImportGroup[]; sdkExportCount: number }> {
  const entryPoints = await resolveEntryPoints();
  if (entryPoints.length === 0) {
    throw new Error("no addon-sandbox/sdk entries found in root package.json exports");
  }

  const compilerOptions: ts.CompilerOptions = {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    customConditions: ["bun"],
    esModuleInterop: true,
    resolveJsonModule: true,
    strict: true,
    skipLibCheck: true,
    noEmit: true,
    experimentalDecorators: true,
    baseUrl: REPO_ROOT,
    paths: {
      "@lumi/contracts": [path.join(REPO_ROOT, "packages/contracts/src/index.ts")],
      "@lumi/contracts/views": [path.join(REPO_ROOT, "packages/contracts/src/views.ts")],
      "@lumi/contracts/rpc": [path.join(REPO_ROOT, "packages/contracts/src/rpc/index.ts")],
      "@lumi/contracts/events": [path.join(REPO_ROOT, "packages/contracts/src/events.ts")],
      "#lib/env.js": [path.join(REPO_ROOT, "packages/core/src/lib/env.ts")],
      "#lib/*.js": [path.join(REPO_ROOT, "packages/core/src/lib/*.ts")],
    },
  };

  const program = ts.createProgram(
    entryPoints.map((e) => e.file),
    compilerOptions,
  );
  const checker = program.getTypeChecker();

  const sdkImportGroups: SdkImportGroup[] = [];
  for (const entry of entryPoints) {
    const sourceFile = program.getSourceFile(entry.file);
    if (!sourceFile) {
      throw new Error(`could not load source file for ${entry.importPath} (${entry.file})`);
    }
    const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
    if (!moduleSymbol) {
      throw new Error(`${entry.importPath} has no module symbol — is it a valid ES module?`);
    }
    const exportedSymbols = checker.getExportsOfModule(moduleSymbol);
    const exports: SdkExportEntry[] = [];
    for (const symbol of exportedSymbols) {
      const described = describeExport(checker, symbol.getName(), symbol, sourceFile);
      if (described) exports.push(described);
    }
    exports.sort((a, b) => a.name.localeCompare(b.name));
    if (exports.length === 0) {
      throw new Error(`${entry.importPath} exports nothing — check the entry file`);
    }
    sdkImportGroups.push({
      importPath: entry.importPath,
      file: path.relative(REPO_ROOT, entry.file),
      exports,
    });
  }

  const sdkExportCount = sdkImportGroups.reduce((total, g) => total + g.exports.length, 0);
  return { sdkImportGroups, sdkExportCount };
}
