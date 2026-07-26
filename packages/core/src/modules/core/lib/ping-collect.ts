import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { createRequire } from "node:module";
import { container } from "@sapphire/framework";
import { fetch, FetchResultTypes } from "@sapphire/fetch";
import { Stopwatch } from "@sapphire/stopwatch";
import type { Redis } from "ioredis";
import type { ModuleRecord } from "#lib/module-system/ModuleStore.js";
import { logError } from "#lib/utilities/errors.js";

export interface ShardInfo {
  id: number;
  ping: number;
  status: string;
  sequence: number;
}

export interface TableStat {
  name: string;
  bytes: bigint;
  deadTuples: bigint;
}

export interface PingData {
  roundTrip: number | null;

  wsPing: number;
  loopLagMs: number;
  jitterMs: number;
  shards: ShardInfo[];
  activeHandles: number;
  activeRequests: number;
  gatewayNode: string;
  identifies: number;
  resumes: number;

  heapUsed: number;
  heapTotal: number;
  rss: number;
  external: number;
  arrayBuffers: number;
  runtime: string;

  kernel: string;
  platform: string;
  arch: string;
  cpuModel: string;
  cpuCores: number;
  cpuSpeedMhz: number;
  loadAvg: [number, number, number];
  ramUsed: number;
  ramTotal: number;
  swapUsedKb: number;
  swapTotalKb: number;
  osUptimeSecs: number;
  ctxSwitchVol: number;
  ctxSwitchNonvol: number;
  diskReadBytes: number;
  diskWriteBytes: number;
  thermalCelsius: number | null;
  cpuPercent: number;
  cpuFlags: string;
  ioWait: number;

  prismaMs: number | null;
  dbSize: string | null;
  dbUptimeSecs: number | null;
  tableSizes: TableStat[];
  dbCommits: number | null;
  dbRollbacks: number | null;
  txRate: number;

  redisReadMs: number | null;
  redisWriteMs: number | null;
  redisVersion: string;
  redisUptimeSecs: number;
  redisMemUsedBytes: number;
  redisMemPeakBytes: number;
  redisFragRatio: number;
  redisHitRatio: number;
  redisHits: number;
  redisMisses: number;
  redisEvicted: number;
  redisClients: number;
  redisTotalKeys: number;

  rabbitConnected: boolean;
  rabbitQueued: number;
  rabbitConsumers: number;

  uptime: number;
  guilds: number;
  users: number;
  channels: number;
  modules: ModuleRecord[];
  avatarURL: string;
  botName: string;
  botId: string;
  sessionCommandCount: number;
  depCount: number;
  codeLines: number;
  commandsPerSec: number;
  messagesPerMin: number;

  djsVersion: string;
  sapphireVersion: string;
  prismaVersion: string;
}

export const SESSION_START = Date.now();
export let sessionCommandCount = 0;
const PING_HISTORY: number[] = [];

let lastSampleTime = Date.now();
let lastCmdCount = 0;
let lastMsgCount = 0;
let lastTxCount = 0;

let cachedCommandsPerSec = 0;
let cachedMessagesPerMin = 0;
let cachedTxRate = 0;

export function recordInvocation(wsPing: number) {
  sessionCommandCount++;
  if (wsPing > 0) {
    PING_HISTORY.push(wsPing);
    if (PING_HISTORY.length > 20) PING_HISTORY.shift();
  }

  const now = Date.now();
  const delta = (now - lastSampleTime) / 1000;

  if (delta >= 2) {
    cachedCommandsPerSec = (sessionCommandCount - lastCmdCount) / delta;
    cachedMessagesPerMin =
      ((container.stats.messages - lastMsgCount) / delta) * 60;
    lastCmdCount = sessionCommandCount;
    lastMsgCount = container.stats.messages;
    lastSampleTime = now;
  }
}

function computeJitter() {
  if (PING_HISTORY.length < 2) return 0;
  const mean = PING_HISTORY.reduce((a, b) => a + b, 0) / PING_HISTORY.length;
  const variance =
    PING_HISTORY.reduce((a, b) => a + Math.pow(b - mean, 2), 0) /
    PING_HISTORY.length;
  return Math.sqrt(variance);
}

async function measureLoopLag(): Promise<number> {
  return new Promise((resolve) => {
    const t = process.hrtime.bigint();
    setImmediate(() =>
      resolve(Number(process.hrtime.bigint() - t) / 1_000_000),
    );
  });
}

async function readProcFile(file: string) {
  const text = await fs.readFile(file, "utf-8").catch(() => "");
  const result: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    result[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return result;
}

let cachedGatewayNode: string | null = null;
async function getGatewayNode(): Promise<string> {
  if (cachedGatewayNode !== null) return cachedGatewayNode;
  try {
    const text = await fetch(
      "https://discord.com/cdn-cgi/trace",
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        },
      },
      FetchResultTypes.Text,
    );
    cachedGatewayNode = text.match(/colo=([A-Z0-9]+)/)?.[1] ?? "Unknown";
  } catch {
    cachedGatewayNode = "Unknown";
  }
  return cachedGatewayNode;
}

function parseRedisInfo(raw: string) {
  const result: Record<string, string> = {};
  for (const line of raw.split("\r\n")) {
    if (line.startsWith("#") || !line.includes(":")) continue;
    const idx = line.indexOf(":");
    result[line.slice(0, idx)] = line.slice(idx + 1);
  }
  return result;
}

async function probeRedisRead(redis: Redis) {
  const sw = new Stopwatch();
  await redis.get("lumi:ping:probe");
  return sw.stop().duration;
}

async function probeRedisWrite(redis: Redis) {
  const sw = new Stopwatch();
  await redis.set("lumi:ping:probe", "1", "EX", 30);
  return sw.stop().duration;
}

const STAT_TTL_MS = 5_000;

interface TtlCache<T> {
  value: T | null;
  at: number;
}

/** Memoize an expensive stat fetch for STAT_TTL_MS, caching the in-flight promise. */
function ttlCached<T>(cache: TtlCache<T>, fn: () => T): T {
  const now = Date.now();
  if (!cache.value || now - cache.at > STAT_TTL_MS) {
    cache.at = now;
    cache.value = fn();
  }
  return cache.value;
}

const pgStat: TtlCache<ReturnType<typeof postgresStats>> = {
  value: null,
  at: 0,
};
const rdStat: TtlCache<ReturnType<typeof redisStats>> = {
  value: null,
  at: 0,
};

async function probePrisma() {
  return container.db.probePrisma();
}

async function postgresStats() {
  try {
    const { overview: ov, tables, tx } = await container.db.getPostgresStats();

    const commits = tx ? parseInt(tx.commits, 10) : 0;
    const now = Date.now();
    const delta = (now - lastSampleTime) / 1000;
    if (delta >= 2) {
      cachedTxRate = (commits - lastTxCount) / delta;
      lastTxCount = commits;
    }

    return {
      dbSize: ov?.size ?? null,
      dbUptimeSecs: ov ? parseInt(ov.uptime_secs, 10) : null,
      tableSizes: (tables ?? []).map((r) => ({
        name: r.relname,
        bytes: BigInt(r.bytes),
        deadTuples: BigInt(r.dead),
      })),
      dbCommits: commits,
      dbRollbacks: tx ? parseInt(tx.rollbacks, 10) : null,
      txRate: cachedTxRate,
    };
  } catch (err: unknown) {
    logError("Ping: Postgres stats failed", err);
    return {
      dbSize: null,
      dbUptimeSecs: null,
      tableSizes: [],
      dbCommits: null,
      dbRollbacks: null,
      txRate: 0,
    };
  }
}

async function redisStats(redis: Redis) {
  try {
    const raw = await redis.info();
    const info = parseRedisInfo(raw);
    const hits = parseInt(info.keyspace_hits ?? "0", 10);
    const misses = parseInt(info.keyspace_misses ?? "0", 10);
    const total = hits + misses;
    const dbSize = await redis.dbsize().catch(() => 0);
    return {
      redisVersion: info.redis_version ?? "unknown",
      redisUptimeSecs: parseInt(info.uptime_in_seconds ?? "0", 10),
      redisMemUsedBytes: parseInt(info.used_memory ?? "0", 10),
      redisMemPeakBytes: parseInt(info.used_memory_peak ?? "0", 10),
      redisFragRatio: parseFloat(info.mem_fragmentation_ratio ?? "1"),
      redisHitRatio: total > 0 ? (hits / total) * 100 : 0,
      redisHits: hits,
      redisMisses: misses,
      redisEvicted: parseInt(info.evicted_keys ?? "0", 10),
      redisClients: parseInt(info.connected_clients ?? "0", 10),
      redisTotalKeys: dbSize,
    };
  } catch (err: unknown) {
    logError("Ping: Redis stats failed", err);
    return {
      redisVersion: "unknown",
      redisUptimeSecs: 0,
      redisMemUsedBytes: 0,
      redisMemPeakBytes: 0,
      redisFragRatio: 1,
      redisHitRatio: 0,
      redisHits: 0,
      redisMisses: 0,
      redisEvicted: 0,
      redisClients: 0,
      redisTotalKeys: 0,
    };
  }
}

async function hostStats() {
  const [meminfo, status, io, thermal, cpuinfo, stat] = await Promise.all([
    readProcFile("/proc/meminfo"),
    readProcFile("/proc/self/status"),
    readProcFile("/proc/self/io"),
    fs
      .readFile("/sys/class/thermal/thermal_zone0/temp", "utf-8")
      .catch(() => null),
    fs.readFile("/proc/cpuinfo", "utf-8").catch(() => ""),
    fs.readFile("/proc/stat", "utf-8").catch(() => ""),
  ]);

  const swapTotalKb = parseInt(
    (meminfo["SwapTotal"] ?? "0 kB").replace(/\s*kB.*/, ""),
    10,
  );
  const swapFreeKb = parseInt(
    (meminfo["SwapFree"] ?? "0 kB").replace(/\s*kB.*/, ""),
    10,
  );

  const flagsMatch = cpuinfo.match(/^flags\s*:\s*(.*)$/m);
  const flags = flagsMatch
    ? flagsMatch[1]!
        .split(" ")
        .filter((f) => ["avx2", "sse4_2", "aes", "rdseed"].includes(f))
        .join(" ")
        .toUpperCase()
    : "STANDARD";

  const cpuLine = stat.split("\n").find((l) => l.startsWith("cpu "));
  const ioWait = cpuLine ? parseInt(cpuLine.split(/\s+/)[5]!, 10) || 0 : 0;

  return {
    kernel: os.release(),
    swapUsedKb: swapTotalKb - swapFreeKb,
    swapTotalKb,
    ctxSwitchVol: parseInt(status["voluntary_ctxt_switches"] ?? "0", 10),
    ctxSwitchNonvol: parseInt(status["nonvoluntary_ctxt_switches"] ?? "0", 10),
    diskReadBytes: parseInt(io.rchar ?? "0", 10),
    diskWriteBytes: parseInt(io.wchar ?? "0", 10),
    thermalCelsius: thermal ? parseInt(thermal.trim(), 10) / 1000 : null,
    cpuFlags: flags,
    ioWait,
  };
}

let cachedDepCount: number | null = null;
let cachedCodeLines: number | null = null;

async function countDeps() {
  if (cachedDepCount !== null) return cachedDepCount;
  const nmPath = path.join(process.cwd(), "node_modules");
  const dirs = await fs.readdir(nmPath).catch(() => []);
  cachedDepCount = dirs.filter((d) => !d.startsWith(".")).length;
  return cachedDepCount;
}

async function countCodeLines() {
  if (cachedCodeLines !== null) return cachedCodeLines;
  const srcPath = path.join(process.cwd(), "packages", "core", "src");
  let total = 0;
  const walk = async (dir: string): Promise<void> => {
    const entries = await fs
      .readdir(dir, { withFileTypes: true })
      .catch(() => []);
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        await walk(full);
        continue;
      }
      if (!e.name.endsWith(".ts")) continue;
      const content = await fs.readFile(full, "utf-8").catch(() => "");
      total += content.split("\n").length;
    }
  };
  await walk(srcPath);
  cachedCodeLines = total;
  return cachedCodeLines;
}

const _req = createRequire(import.meta.url);
const djsVersion = (_req("discord.js/package.json") as { version: string })
  .version;
const sapphireVersion = (
  _req("@sapphire/framework/package.json") as { version: string }
).version;
const prismaVersion = (
  _req("@prisma/client/package.json") as { version: string }
).version;

declare const Bun: { version: string } | undefined;

export function getRuntimeLabel() {
  if (typeof Bun !== "undefined") return `Bun v${Bun.version}`;
  return `Node.js ${process.version}`;
}

export async function collectPingData(): Promise<Omit<PingData, "roundTrip">> {
  const { client, redis, moduleStore, stats, rabbit } = container;
  const wsPing = client.ws.ping ?? 0;

  recordInvocation(wsPing);

  const cpuBefore = process.cpuUsage();
  const nsBefore = process.hrtime.bigint();

  const [
    loopLagMs,
    prismaMs,
    redisReadMs,
    redisWriteMs,
    pgStats,
    rdStats,
    hostData,
    depCount,
    codeLines,
    gatewayNode,
  ] = await Promise.all([
    measureLoopLag(),
    probePrisma().catch(() => null),
    probeRedisRead(redis).catch(() => null),
    probeRedisWrite(redis).catch(() => null),
    ttlCached(pgStat, postgresStats),
    ttlCached(rdStat, () => redisStats(redis)),
    hostStats(),
    countDeps(),
    countCodeLines(),
    getGatewayNode(),
  ]);

  const cpuDelta = process.cpuUsage(cpuBefore);
  const nsElapsed = Number(process.hrtime.bigint() - nsBefore);
  const cpuPercent =
    ((cpuDelta.user + cpuDelta.system) / 1000 / (nsElapsed / 1000)) * 100;

  const mem = process.memoryUsage();
  const cpus = os.cpus();

  const shards: ShardInfo[] = [];
  const ids = client.shard?.ids ?? [0];
  for (const id of ids) {
    shards.push({
      id: Number(id),
      ping: wsPing < 0 ? -1 : wsPing,
      status: client.isReady() ? "Ready" : "Disconnected",
      sequence: 0,
    });
  }

  const proc = process as {
    _getActiveHandles?: () => { length: number };
    _getActiveRequests?: () => { length: number };
  };

  let rabbitQueued = 0;
  let rabbitConsumers = 0;
  if (rabbit) {
    try {
      const q = await rabbit.channel.checkQueue("lumi.rpc.requests");
      rabbitQueued = q.messageCount;
      rabbitConsumers = q.consumerCount;
    } catch (err: unknown) {
      logError("Ping: RabbitMQ queue check failed", err);
    }
  }

  return {
    wsPing,
    loopLagMs,
    jitterMs: computeJitter(),
    shards,
    activeHandles: proc._getActiveHandles?.()?.length ?? 0,
    activeRequests: proc._getActiveRequests?.()?.length ?? 0,
    gatewayNode,
    identifies: stats.identifies,
    resumes: stats.resumes,

    heapUsed: mem.heapUsed,
    heapTotal: mem.heapTotal,
    rss: mem.rss,
    external: mem.external,
    arrayBuffers: mem.arrayBuffers ?? 0,
    runtime: getRuntimeLabel(),

    ...hostData,
    platform: os.platform(),
    arch: os.arch(),
    cpuModel: cpus[0]?.model?.replace(/\s+/g, " ").trim() ?? "Unknown",
    cpuCores: cpus.length,
    cpuSpeedMhz: cpus[0]?.speed ?? 0,
    loadAvg: os.loadavg() as [number, number, number],
    ramUsed: os.totalmem() - os.freemem(),
    ramTotal: os.totalmem(),
    osUptimeSecs: os.uptime(),
    cpuPercent,

    prismaMs,
    ...pgStats,

    redisReadMs,
    redisWriteMs,
    ...rdStats,

    rabbitConnected: rabbit?.connected ?? false,
    rabbitQueued,
    rabbitConsumers,

    uptime: client.uptime ?? 0,
    guilds: client.guilds.cache.size,
    users: client.guilds.cache.reduce((acc, g) => acc + g.memberCount, 0),
    channels: client.channels.cache.size,
    modules: moduleStore.loaded(),
    avatarURL:
      client.user?.displayAvatarURL({ size: 256, extension: "png" }) ?? "",
    botName: client.user?.username ?? "Lumi",
    botId: client.user?.id ?? "",
    sessionCommandCount,
    depCount,
    codeLines,
    commandsPerSec: cachedCommandsPerSec,
    messagesPerMin: cachedMessagesPerMin,

    djsVersion,
    sapphireVersion,
    prismaVersion,
  };
}
