/**
 * Ping data collection — all async probes for every metric layer.
 * Imported by both the command and the interaction handler.
 */
import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { createRequire } from 'node:module';
import { container } from '@sapphire/framework';
import type { Redis } from 'ioredis';
import type { ModuleRecord } from '#lib/module-system.js';

// ── Types ─────────────────────────────────────────────────────────────────────

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
	// Round-trip (filled in after send)
	roundTrip: number | null;

	// Gateway
	wsPing: number;
	loopLagMs: number;
	jitterMs: number;
	shards: ShardInfo[];
	activeHandles: number;
	activeRequests: number;
	gatewayNode: string;
	identifies: number;
	resumes: number;

	// Engine
	heapUsed: number;
	heapTotal: number;
	rss: number;
	external: number;
	arrayBuffers: number;
	runtime: string;

	// Host
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

	// Postgres
	prismaMs: number | null;
	dbSize: string | null;
	dbUptimeSecs: number | null;
	tableSizes: TableStat[];
	dbCommits: number | null;
	dbRollbacks: number | null;
	txRate: number;

	// Redis
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

	// RabbitMQ
	rabbitConnected: boolean;
	rabbitQueued: number;
	rabbitConsumers: number;

	// Bot
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

	// Library versions
	djsVersion: string;
	sapphireVersion: string;
	prismaVersion: string;
}

// ── Sampling & History ────────────────────────────────────────────────────────

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

export function recordInvocation(wsPing: number): void {
	sessionCommandCount++;
	if (wsPing > 0) {
		PING_HISTORY.push(wsPing);
		if (PING_HISTORY.length > 20) PING_HISTORY.shift();
	}

	const now = Date.now();
	const delta = (now - lastSampleTime) / 1000;

	if (delta >= 2) {
		// Sample rates
		cachedCommandsPerSec = (sessionCommandCount - lastCmdCount) / delta;
		cachedMessagesPerMin = ((container.stats.messages - lastMsgCount) / delta) * 60;

		lastCmdCount = sessionCommandCount;
		lastMsgCount = container.stats.messages;
		lastSampleTime = now;
	}
}

function computeJitter(): number {
	if (PING_HISTORY.length < 2) return 0;
	const mean = PING_HISTORY.reduce((a, b) => a + b, 0) / PING_HISTORY.length;
	const variance = PING_HISTORY.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / PING_HISTORY.length;
	return Math.sqrt(variance);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function measureLoopLag(): Promise<number> {
	return new Promise((resolve) => {
		const t = process.hrtime.bigint();
		setImmediate(() => resolve(Number(process.hrtime.bigint() - t) / 1_000_000));
	});
}

async function readProcFile(file: string): Promise<Record<string, string>> {
	const text = await fs.readFile(file, 'utf-8').catch(() => '');
	const result: Record<string, string> = {};
	for (const line of text.split('\n')) {
		const idx = line.indexOf(':');
		if (idx < 0) continue;
		result[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
	}
	return result;
}

async function getGatewayNode(): Promise<string> {
	try {
		const res = await fetch('https://discord.com/cdn-cgi/trace').then((r) => r.text());
		const m = res.match(/colo=([A-Z0-9]+)/);
		return m ? m[1] : 'Unknown';
	} catch {
		return 'Unknown';
	}
}

function parseRedisInfo(raw: string): Record<string, string> {
	const result: Record<string, string> = {};
	for (const line of raw.split('\r\n')) {
		if (line.startsWith('#') || !line.includes(':')) continue;
		const idx = line.indexOf(':');
		result[line.slice(0, idx)] = line.slice(idx + 1);
	}
	return result;
}

async function probeRedisRead(redis: Redis): Promise<number> {
	const t = Date.now();
	await redis.get('ember:ping:probe');
	return Date.now() - t;
}

async function probeRedisWrite(redis: Redis): Promise<number> {
	const t = Date.now();
	await redis.set('ember:ping:probe', '1', 'EX', 30);
	return Date.now() - t;
}

interface RawPrisma {
	$queryRawUnsafe: <T = unknown[]>(q: string, ...vals: unknown[]) => Promise<T>;
}

async function probePrisma(): Promise<number> {
	const t = Date.now();
	await (container.prisma as unknown as RawPrisma).$queryRawUnsafe('SELECT 1');
	return Date.now() - t;
}

async function postgresStats(): Promise<Pick<PingData, 'dbSize' | 'dbUptimeSecs' | 'tableSizes' | 'dbCommits' | 'dbRollbacks' | 'txRate'>> {
	const raw = container.prisma as unknown as RawPrisma;
	try {
		type Overview = { size: string; uptime_secs: string }[];
		const [ov] = await raw.$queryRawUnsafe<Overview>(
			`SELECT pg_size_pretty(pg_database_size(current_database())) AS size,
			        extract(epoch from (now() - pg_postmaster_start_time()))::int::text AS uptime_secs`
		);

		type TableRow = { relname: string; bytes: string; dead: string }[];
		const tables = await raw.$queryRawUnsafe<TableRow>(
			`SELECT relname, pg_total_relation_size(relid)::text AS bytes, n_dead_tup::text AS dead
			 FROM pg_stat_user_tables ORDER BY pg_total_relation_size(relid) DESC LIMIT 6`
		);

		type TxRow = { commits: string; rollbacks: string }[];
		const [tx] = await raw.$queryRawUnsafe<TxRow>(
			`SELECT xact_commit::text AS commits, xact_rollback::text AS rollbacks
			 FROM pg_stat_database WHERE datname = current_database()`
		);

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
				deadTuples: BigInt(r.dead)
			})),
			dbCommits: commits,
			dbRollbacks: tx ? parseInt(tx.rollbacks, 10) : null,
			txRate: cachedTxRate
		};
	} catch {
		return { dbSize: null, dbUptimeSecs: null, tableSizes: [], dbCommits: null, dbRollbacks: null, txRate: 0 };
	}
}

async function redisStats(
	redis: Redis
): Promise<
	Omit<
		Pick<
			PingData,
			| 'redisVersion'
			| 'redisUptimeSecs'
			| 'redisMemUsedBytes'
			| 'redisMemPeakBytes'
			| 'redisFragRatio'
			| 'redisHitRatio'
			| 'redisHits'
			| 'redisMisses'
			| 'redisEvicted'
			| 'redisClients'
			| 'redisTotalKeys'
		>,
		never
	>
> {
	try {
		const raw = await redis.info();
		const info = parseRedisInfo(raw);
		const hits = parseInt(info.keyspace_hits ?? '0', 10);
		const misses = parseInt(info.keyspace_misses ?? '0', 10);
		const total = hits + misses;
		const dbSize = await redis.dbsize().catch(() => 0);
		return {
			redisVersion: info.redis_version ?? 'unknown',
			redisUptimeSecs: parseInt(info.uptime_in_seconds ?? '0', 10),
			redisMemUsedBytes: parseInt(info.used_memory ?? '0', 10),
			redisMemPeakBytes: parseInt(info.used_memory_peak ?? '0', 10),
			redisFragRatio: parseFloat(info.mem_fragmentation_ratio ?? '1'),
			redisHitRatio: total > 0 ? (hits / total) * 100 : 0,
			redisHits: hits,
			redisMisses: misses,
			redisEvicted: parseInt(info.evicted_keys ?? '0', 10),
			redisClients: parseInt(info.connected_clients ?? '0', 10),
			redisTotalKeys: dbSize
		};
	} catch {
		return {
			redisVersion: 'unknown',
			redisUptimeSecs: 0,
			redisMemUsedBytes: 0,
			redisMemPeakBytes: 0,
			redisFragRatio: 1,
			redisHitRatio: 0,
			redisHits: 0,
			redisMisses: 0,
			redisEvicted: 0,
			redisClients: 0,
			redisTotalKeys: 0
		};
	}
}

async function hostStats(): Promise<
	Pick<
		PingData,
		| 'kernel'
		| 'swapUsedKb'
		| 'swapTotalKb'
		| 'ctxSwitchVol'
		| 'ctxSwitchNonvol'
		| 'diskReadBytes'
		| 'diskWriteBytes'
		| 'thermalCelsius'
		| 'cpuFlags'
		| 'ioWait'
	>
> {
	const [meminfo, status, io, thermal, cpuinfo, stat] = await Promise.all([
		readProcFile('/proc/meminfo'),
		readProcFile('/proc/self/status'),
		readProcFile('/proc/self/io'),
		fs.readFile('/sys/class/thermal/thermal_zone0/temp', 'utf-8').catch(() => null),
		fs.readFile('/proc/cpuinfo', 'utf-8').catch(() => ''),
		fs.readFile('/proc/stat', 'utf-8').catch(() => '')
	]);

	const swapTotalKb = parseInt((meminfo['SwapTotal'] ?? '0 kB').replace(/\s*kB.*/, ''), 10);
	const swapFreeKb = parseInt((meminfo['SwapFree'] ?? '0 kB').replace(/\s*kB.*/, ''), 10);
	const swapUsedKb = swapTotalKb - swapFreeKb;

	const flagsMatch = cpuinfo.match(/^flags\s*:\s*(.*)$/m);
	const flags = flagsMatch
		? flagsMatch[1]
				.split(' ')
				.filter((f) => ['avx2', 'sse4_2', 'aes', 'rdseed'].includes(f))
				.join(' ')
				.toUpperCase()
		: 'N/A';

	const statLines = stat.split('\n');
	const cpuLine = statLines.find((l) => l.startsWith('cpu '));
	let ioWait = 0;
	if (cpuLine) {
		const parts = cpuLine.split(/\s+/);
		ioWait = parseInt(parts[5], 10) || 0; // iowait is the 5th column in /proc/stat
	}

	return {
		kernel: os.release(),
		swapUsedKb,
		swapTotalKb,
		ctxSwitchVol: parseInt(status['voluntary_ctxt_switches'] ?? '0', 10),
		ctxSwitchNonvol: parseInt(status['nonvoluntary_ctxt_switches'] ?? '0', 10),
		diskReadBytes: parseInt(io.rchar ?? '0', 10),
		diskWriteBytes: parseInt(io.wchar ?? '0', 10),
		thermalCelsius: thermal ? parseInt(thermal.trim(), 10) / 1000 : null,
		cpuFlags: flags || 'STANDARD',
		ioWait
	};
}

async function countDeps(): Promise<number> {
	const nmPath = path.join(process.cwd(), 'node_modules');
	const dirs = await fs.readdir(nmPath).catch(() => [] as string[]);
	return dirs.filter((d) => !d.startsWith('.')).length;
}

async function countCodeLines(): Promise<number> {
	const srcPath = path.join(process.cwd(), 'src');
	let total = 0;
	const walk = async (dir: string): Promise<void> => {
		const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
		for (const e of entries) {
			const full = path.join(dir, e.name);
			if (e.isDirectory()) {
				await walk(full);
				continue;
			}
			if (!e.name.endsWith('.ts')) continue;
			const content = await fs.readFile(full, 'utf-8').catch(() => '');
			total += content.split('\n').length;
		}
	};
	await walk(srcPath);
	return total;
}

// ── Version resolution ────────────────────────────────────────────────────────

const _req = createRequire(import.meta.url);
const djsVersion: string = (_req('discord.js/package.json') as { version: string }).version;
const sapphireVersion: string = (_req('@sapphire/framework/package.json') as { version: string }).version;
const prismaVersion: string = (_req('@prisma/client/package.json') as { version: string }).version;

export function getRuntimeLabel(): string {
	const g = globalThis as Record<string, unknown>;
	if (g.Bun && typeof g.Bun === 'object' && 'version' in g.Bun) return `Bun v${(g.Bun as { version: string }).version}`;
	return `Node.js ${process.version}`;
}

// ── Main collection entry point ───────────────────────────────────────────────

export async function collectPingData(): Promise<Omit<PingData, 'roundTrip'>> {
	const { client, redis, moduleManager, stats, rabbit } = container;
	const wsPing = client.ws.ping;

	recordInvocation(wsPing);

	// CPU sample window — run all probes concurrently inside it
	const cpuBefore = process.cpuUsage();
	const nsBefore = process.hrtime.bigint();

	const [loopLagMs, prismaMs, redisReadMs, redisWriteMs, pgStats, rdStats, hostData, depCount, codeLines, gatewayNode] = await Promise.all([
		measureLoopLag(),
		probePrisma().catch(() => null),
		probeRedisRead(redis).catch(() => null),
		probeRedisWrite(redis).catch(() => null),
		postgresStats(),
		redisStats(redis),
		hostStats(),
		countDeps(),
		countCodeLines(),
		getGatewayNode()
	]);

	const cpuDelta = process.cpuUsage(cpuBefore);
	const nsElapsed = Number(process.hrtime.bigint() - nsBefore);
	const cpuPercent = ((cpuDelta.user + cpuDelta.system) / 1000 / (nsElapsed / 1000)) * 100;

	const mem = process.memoryUsage();
	const cpus = os.cpus();

	const shards: ShardInfo[] = [];
	const ws = client.ws as unknown as { shards: Map<number, { ping: number; status: number; sequence?: number }> };
	for (const [id, shard] of ws.shards ?? new Map()) {
		const statusMap: Record<number, string> = {
			0: 'Ready',
			1: 'Connecting',
			2: 'Reconnecting',
			3: 'Idle',
			4: 'Nearly',
			5: 'Disconnected',
			6: 'Waiting for Guilds',
			7: 'Identifying',
			8: 'Resuming'
		};
		shards.push({
			id,
			ping: shard.ping < 0 ? -1 : shard.ping,
			status: statusMap[shard.status] ?? 'Unknown',
			sequence: shard.sequence ?? 0
		});
	}

	const proc = process as NodeJS.Process & {
		_getActiveHandles?: () => unknown[];
		_getActiveRequests?: () => unknown[];
	};

	let rabbitQueued = 0;
	let rabbitConsumers = 0;
	if (rabbit) {
		try {
			// Quick check of the main job queue
			const q = await rabbit.channel.checkQueue('ember.jobs.active');
			rabbitQueued = q.messageCount;
			rabbitConsumers = q.consumerCount;
		} catch {
			/* ignore */
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
		cpuModel: cpus[0]?.model?.replace(/\s+/g, ' ').trim() ?? 'Unknown',
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

		rabbitConnected: Boolean(rabbit),
		rabbitQueued,
		rabbitConsumers,

		uptime: client.uptime ?? 0,
		guilds: client.guilds.cache.size,
		users: client.users.cache.size,
		channels: client.channels.cache.size,
		modules: moduleManager.loaded(),
		avatarURL: client.user?.displayAvatarURL({ size: 256, extension: 'png' }) ?? '',
		botName: client.user?.username ?? 'Ember',
		botId: client.user?.id ?? '',
		sessionCommandCount,
		depCount,
		codeLines,
		commandsPerSec: cachedCommandsPerSec,
		messagesPerMin: cachedMessagesPerMin,

		djsVersion,
		sapphireVersion,
		prismaVersion
	};
}
