/**
 * Executive-Class Aesthetic Card builders.
 * High-end, structured, and extremely readable data layouts.
 * Stacked Label-Value pairs for maximized clarity.
 */
import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ContainerBuilder,
	MessageFlags,
	SectionBuilder,
	SeparatorBuilder,
	SeparatorSpacingSize,
	TextDisplayBuilder,
	ThumbnailBuilder,
	type MessageActionRowComponentBuilder
} from 'discord.js';
import type { PingData } from './ping-collect.js';
import { EmberColors } from '#lib/branding.js';

// ── Re-exports for convenience ────────────────────────────────────────────────

export const PING_FLAGS = MessageFlags.IsComponentsV2 as number;
export const EPHEMERAL_FLAGS = (MessageFlags.IsComponentsV2 as number) | (MessageFlags.Ephemeral as number);

export type PingCategory = 'gateway' | 'engine' | 'host' | 'postgres' | 'redis' | 'rabbitmq' | 'bot';

// ── Aesthetic Helpers ─────────────────────────────────────────────────────────

function fmtMs(n: number | null): string {
	if (n === null || n < 0) return 'Analyzing…';
	return `${n}ms`;
}

function fmtMB(bytes: number): string {
	return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function fmtKB(bytes: bigint | number): string {
	const n = typeof bytes === 'bigint' ? Number(bytes) : bytes;
	if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} GB`;
	if (n >= 1024) return `${(n / 1024).toFixed(1)} MB`;
	return `${n} B`;
}

function fmtUptime(secs: number): string {
	const s = Math.floor(secs);
	const m = Math.floor(s / 60) % 60;
	const h = Math.floor(s / 3600) % 24;
	const d = Math.floor(s / 86400);
	if (d > 0) return `${d}d ${h}h ${m}m`;
	if (h > 0) return `${h}h ${m}m`;
	return `${m}m ${s % 60}s`;
}

function fmtUptimeMs(ms: number): string {
	return fmtUptime(ms / 1000);
}

function sep(divider = true) {
	return new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(divider);
}

function txt(content: string) {
	return new TextDisplayBuilder().setContent(content);
}

/** 
 * Stacked Executive Layout:
 * - Simple Header
 * - Blockquote wrapper
 * - Label on top
 * - Indented Value below
 */
function executiveSection(title: string, fields: [string, string][], insight?: string): string {
	const header = `### ${title.toUpperCase()}`;
	const lines = fields.map(([label, value]) => `> **${label}**\n> ┕ ***${value}***`).join('\n');
	const footer = insight ? `\n> -# *${insight}*` : '';
	return `${header}\n${lines}${footer}`;
}

function getStatusColor(d: PingData): number {
	const worst = Math.max(d.wsPing, d.prismaMs ?? 0, d.redisReadMs ?? 0);
	const lagBad = d.loopLagMs > 10;
	if (worst > 250 || lagBad) return EmberColors.ROSE;
	if (worst > 100) return EmberColors.LEMON;
	return EmberColors.SAKURA;
}

function statusBanner(d: PingData): string {
	const worst = Math.max(d.wsPing, d.prismaMs ?? 0, d.redisReadMs ?? 0);
	const lagBad = d.loopLagMs > 10;
	if (worst > 250 || lagBad) return `# 🌸 __SYSTEM STATUS: DEGRADED__`;
	if (worst > 100) return `# 🍋 __SYSTEM STATUS: FAIR__`;
	return `# 🌸 __SYSTEM STATUS: OPTIMAL__`;
}

function categoryButtons(userId: string): ActionRowBuilder<MessageActionRowComponentBuilder>[] {
	const btn = (cat: PingCategory, label: string) =>
		new ButtonBuilder().setCustomId(`ping:${cat}:${userId}`).setLabel(label).setStyle(ButtonStyle.Secondary);

	return [
		new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
			btn('gateway', '🌐 Gateway'),
			btn('engine', '🏎️ Engine'),
			btn('host', '💻 Host'),
			btn('postgres', '🐘 Postgres')
		),
		new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
			btn('redis', '🧠 Redis'),
			btn('rabbitmq', '🐇 RabbitMQ'),
			btn('bot', '🤖 Bot')
		)
	];
}

function header(d: PingData, subtitle?: string): SectionBuilder {
	const sub = subtitle ? `\n*${subtitle}*` : '';
	// Invisible width anchor: ensures the card stays at maximum width even when detail content is sparse.
	// Uses \u2800 (Braille Blank) which is more reliably invisible than Hangul fillers.
	const anchor = '-# ' + '\u2800'.repeat(55);
	return new SectionBuilder()
		.addTextDisplayComponents(txt(`## ${d.botName}${sub}\n${anchor}`))
		.setThumbnailAccessory(
			new ThumbnailBuilder().setURL(d.avatarURL || 'https://cdn.discordapp.com/embed/avatars/0.png')
		);
}

// ── Overview card (Stacked Executive) ─────────────────────────────────────────

export function buildOverviewCard(d: PingData, userId: string): ContainerBuilder {
	const c = new ContainerBuilder();
	c.setAccentColor(getStatusColor(d));

	c.addSectionComponents(header(d, `${d.guilds.toLocaleString()} guilds · ${d.botId}`));
	c.addSeparatorComponents(sep(true));

	c.addTextDisplayComponents(txt(statusBanner(d)));
	c.addSeparatorComponents(sep(true));

	const rt = d.roundTrip;
	const rtStr = rt !== null ? `${rt}ms` : 'Calibrating…';
	const node = d.gatewayNode === 'Unknown' ? 'Analyzing…' : d.gatewayNode;

	c.addTextDisplayComponents(
		txt(
			[
				executiveSection(
					'Network Performance', 
					[
						['Primary Latency', rtStr],
						['WebSocket Ping', fmtMs(d.wsPing)],
						['Event Loop Lag', `${d.loopLagMs.toFixed(2)}ms`]
					],
					`Hub: ${node} | Jitter: ±${d.jitterMs.toFixed(1)}ms`
				),
				executiveSection(
					'Infrastructure Vitals', 
					[
						['Runtime Version', d.runtime],
						['Process Memory', `${fmtMB(d.rss)} RSS`],
						['CPU Utilization', `${d.cpuPercent.toFixed(1)}%`]
					],
					`Active system handles: ${d.activeHandles}`
				),
				executiveSection(
					'Data Throughput', 
					[
						['Interaction Rate', `${d.commandsPerSec.toFixed(2)} cmd/s`],
						['Database Latency', fmtMs(d.prismaMs)],
						['Cache Hit Ratio', `${d.redisHitRatio.toFixed(1)}%`]
					],
					`Traffic: ${d.messagesPerMin.toFixed(0)} msg/min | Total: ${d.sessionCommandCount.toLocaleString()}`
				)
			].join('\n')
		)
	);
	c.addSeparatorComponents(sep(true));

	for (const row of categoryButtons(userId)) c.addActionRowComponents(row);

	const ts = `<t:${Math.floor(Date.now() / 1000)}:T>`;
	c.addTextDisplayComponents(txt(`-# Refreshed at ${ts} · [Source](https://github.com/ember-bot/ember)`));

	return c;
}

// ── Gateway detail (Stacked Executive) ────────────────────────────────────────

export function buildGatewayCard(d: PingData): ContainerBuilder {
	const c = new ContainerBuilder();
	c.setAccentColor(EmberColors.LAVENDER);
	c.addSectionComponents(header(d, '📡 Gateway Diagnostics Engine'));
	c.addSeparatorComponents(sep(true));

	const node = d.gatewayNode === 'Unknown' ? 'Analyzing…' : d.gatewayNode;

	c.addTextDisplayComponents(
		txt(
			[
				executiveSection(
					'Connection Stability', 
					[
						['Average Latency', fmtMs(d.wsPing)],
						['Heartbeat Jitter', `±${d.jitterMs.toFixed(2)}ms`]
					],
					d.jitterMs < 5 ? 'Rating: Excellent' : 'Rating: Nominal' 
				),
				executiveSection(
					'Session Lifecycle', 
					[
						['Handshake Count', `${d.identifies} Identities`],
						['Resume Attempts', `${d.resumes} Successful`],
						['Regional Gateway', `${node} Hub`]
					],
					`Connected <t:${Math.floor(Date.now() / 1000 - d.uptime / 1000)}:R>`
				),
				executiveSection(
					'Traffic Density', 
					[
						['Observed Ingress', `${d.messagesPerMin.toFixed(0)} msg/min`],
						['Active Requests', `${d.activeRequests} Concurrent`]
					],
					'Real-time aggregation from regional endpoints'
				)
			].join('\n')
		)
	);
	
	if (d.shards.length > 0) {
		c.addSeparatorComponents(sep(true));
		c.addTextDisplayComponents(txt('### 🧊 CLUSTER SHARD MATRIX'));
		const shardLines = d.shards.map(s => `> **Shard ${s.id}**\n> ┕ ***${fmtMs(s.ping)}*** | *${s.status}* | Seq ${s.sequence || 0}`).join('\n');
		c.addTextDisplayComponents(txt(shardLines));
	}

	return c;
}

// ── Engine detail (Stacked Executive) ─────────────────────────────────────────

export function buildEngineCard(d: PingData): ContainerBuilder {
	const c = new ContainerBuilder();
	c.setAccentColor(EmberColors.LEMON);
	c.addSectionComponents(header(d, '🏎️ Runtime Performance Audit'));
	c.addSeparatorComponents(sep(true));

	const heapPct = ((d.heapUsed / d.heapTotal) * 100).toFixed(1);
	c.addTextDisplayComponents(
		txt(
			[
				executiveSection(
					'Memory Allocation', 
					[
						['JS Heap Used', `${fmtMB(d.heapUsed)} (${heapPct}%)`],
						['External Heap', fmtMB(d.external)],
						['Total RSS Cost', fmtMB(d.rss)]
					],
					`ArrayBuffers: ${fmtMB(d.arrayBuffers)}`
				),
				executiveSection(
					'Execution Lag', 
					[
						['Event Loop Lag', `${d.loopLagMs.toFixed(3)}ms`],
						['Timer Handles', `${d.activeHandles} Active`]
					],
					'Primary responsiveness metric'
				),
				executiveSection(
					'Core Environment', 
					[
						['Engine Runtime', d.runtime],
						['Library Stack', `D.JS v${d.djsVersion} | Sapphire v${d.sapphireVersion}`]
					],
					'Optimized on JavaScriptCore (JSC)'
				)
			].join('\n')
		)
	);

	return c;
}

// ── Host detail (Stacked Executive) ───────────────────────────────────────────

export function buildHostCard(d: PingData): ContainerBuilder {
	const c = new ContainerBuilder();
	c.setAccentColor(EmberColors.AMBER);
	c.addSectionComponents(header(d, '💻 Bare Metal Infrastructure'));
	c.addSeparatorComponents(sep(true));

	c.addTextDisplayComponents(
		txt(
			[
				executiveSection(
					'Processing Architecture', 
					[
						['CPU Model', d.cpuModel],
						['Core Topology', `${d.cpuCores} Logic Cores | ${d.arch}`],
						['Instruction Flags', d.cpuFlags]
					],
					`IO Wait: ${d.ioWait} cycles` 
				),
				executiveSection(
					'Resource Saturation', 
					[
						['RAM Utilization', `${(d.ramUsed / 1024 / 1024 / 1024).toFixed(2)}GB / ${(d.ramTotal / 1024 / 1024 / 1024).toFixed(2)}GB`],
						['Total Swap Used', `${(d.swapUsedKb / 1024).toFixed(0)}MB`]
					],
					`Saturation: ${((d.ramUsed / d.ramTotal) * 100).toFixed(1)}%`
				),
				executiveSection(
					'Host System State', 
					[
						['Kernel Version', `${d.platform} ${d.kernel}`],
						['Processor Temp', d.thermalCelsius ? d.thermalCelsius.toFixed(1) + '°C' : 'N/A']
					],
					`Uptime: ${fmtUptime(d.osUptimeSecs)}`
				),
				executiveSection(
					'Process I/O Metrics', 
					[
						['Cumulative Read', fmtKB(d.diskReadBytes)],
						['Cumulative Write', fmtKB(d.diskWriteBytes)]
					],
					`Context Switches: ${d.ctxSwitchVol.toLocaleString()}`
				)
			].join('\n')
		)
	);

	return c;
}

// ── Postgres detail (Stacked Executive) ───────────────────────────────────────

export function buildPostgresCard(d: PingData): ContainerBuilder {
	const c = new ContainerBuilder();
	c.setAccentColor(EmberColors.PEACH);
	c.addSectionComponents(header(d, '🐘 Relational Database Audit'));
	c.addSeparatorComponents(sep(true));

	c.addTextDisplayComponents(
		txt(
			[
				executiveSection(
					'Database Throughput', 
					[
						['Transaction Rate', `${d.txRate.toFixed(1)} ops/sec`],
						['Query Latency', fmtMs(d.prismaMs)]
					],
					`Commits: ${d.dbCommits?.toLocaleString()}`
				),
				executiveSection(
					'Storage Intelligence', 
					[
						['Total DB Size', d.dbSize ?? 'N/A'],
						['Server Uptime', d.dbUptimeSecs ? fmtUptime(d.dbUptimeSecs) : 'N/A']
					],
					`Prisma v${d.prismaVersion} | Monitoring active`
				)
			].join('\n')
		)
	);

	if (d.tableSizes.length > 0) {
		c.addSeparatorComponents(sep(true));
		c.addTextDisplayComponents(txt('### 📊 HIGH-DENSITY TABLE BREAKDOWN'));
		const tableLines = d.tableSizes.map(t => `> **${t.name}**\n> ┕ ***${fmtKB(t.bytes)}***${t.deadTuples > 0n ? ` (⚠️ ${t.deadTuples.toLocaleString()} dead)` : ''}`).join('\n');
		c.addTextDisplayComponents(txt(tableLines));
	}

	return c;
}

// ── Redis detail (Stacked Executive) ──────────────────────────────────────────

export function buildRedisCard(d: PingData): ContainerBuilder {
	const c = new ContainerBuilder();
	c.setAccentColor(EmberColors.ROSE);
	c.addSectionComponents(header(d, '🧠 In-Memory Cache Performance'));
	c.addSeparatorComponents(sep(true));

	c.addTextDisplayComponents(
		txt(
			[
				executiveSection(
					'Memory Utilization', 
					[
						['Current Used', fmtMB(d.redisMemUsedBytes)],
						['Recorded Peak', fmtMB(d.redisMemPeakBytes)],
						['Frag. Ratio', `${d.redisFragRatio.toFixed(2)}x`]
					],
					`Evicted Keys: ${d.redisEvicted.toLocaleString()}`
				),
				executiveSection(
					'Cache Efficiency', 
					[
						['Hit Ratio', `${d.redisHitRatio.toFixed(2)}%`],
						['Total Keys', `${d.redisTotalKeys.toLocaleString()} Managed`]
					],
					`Hits: ${d.redisHits.toLocaleString()} | Misses: ${d.redisMisses.toLocaleString()}`
				),
				executiveSection(
					'Connectivity & State', 
					[
						['Version Info', `Redis v${d.redisVersion}`],
						['Active Clients', `${d.redisClients} Connected`]
					],
					`Latency: ${fmtMs(d.redisReadMs)} / ${fmtMs(d.redisWriteMs)} | Up: ${fmtUptime(d.redisUptimeSecs)}`
				)
			].join('\n')
		)
	);

	return c;
}

// ── RabbitMQ detail (Stacked Executive) ───────────────────────────────────────

export function buildRabbitCard(d: PingData): ContainerBuilder {
	const c = new ContainerBuilder();
	c.setAccentColor(EmberColors.MINT);
	c.addSectionComponents(header(d, '🐇 Distributed Event Pipeline'));
	c.addSeparatorComponents(sep(true));

	if (!d.rabbitConnected) {
		c.addTextDisplayComponents(txt('### 🔴 PIPELINE OFFLINE\n> **Critical connection failure detected for RabbitMQ.**\n┕ -# Background tasks and inter-module RPC are suspended.'));
	} else {
		c.addTextDisplayComponents(
			txt(
				[
					executiveSection(
						'Connection Integrity', 
						[
							['Status', 'Connected & Operational'],
							['Node Heartbeat', 'Active']
						],
						'Monitoring primary exchange synchronization' 
					),
					executiveSection(
						'Message Saturation', 
						[
							['Pending Jobs', `${d.rabbitQueued} Messages`],
							['Active Consumers', `${d.rabbitConsumers} Workers`]
						],
						'Monitoring ember.jobs.active saturation'
					)
				].join('\n')
			)
		);
	}

	return c;
}

// ── Bot Intelligence detail (Stacked Executive) ───────────────────────────────

export function buildBotCard(d: PingData): ContainerBuilder {
	const c = new ContainerBuilder();
	c.setAccentColor(EmberColors.SAKURA);
	c.addSectionComponents(header(d, '🤖 Core Intelligence Diagnostics'));
	c.addSeparatorComponents(sep(true));

	const memPerGuild = d.guilds > 0 ? (d.rss / 1024 / 1024 / d.guilds).toFixed(2) : '0';
	c.addTextDisplayComponents(
		txt(
			[
				executiveSection(
					'Interaction Analytics', 
					[
						['Command Rate', `${d.commandsPerSec.toFixed(2)}/sec`],
						['Message Traffic', `${d.messagesPerMin.toFixed(0)}/min`]
					],
					`Total Session: ${d.sessionCommandCount.toLocaleString()}`
				),
				executiveSection(
					'Efficiency Metrics', 
					[
						['Memory/Guild', `${memPerGuild} MB`],
						['System RSS', fmtMB(d.rss)]
					],
					`Process Uptime: ${fmtUptimeMs(d.uptime)}`
				),
				executiveSection(
					'Software Architecture', 
					[
						['Source Lines', `${d.codeLines.toLocaleString()} TS`],
						['Feature Modules', `${d.modules.length} Loaded`]
					],
					`Third-party: ${d.depCount.toLocaleString()} packages`
				)
			].join('\n')
		)
	);

	return c;
}

// ── Router ────────────────────────────────────────────────────────────────────

export function buildDetailCard(category: PingCategory, d: PingData, userId: string): ContainerBuilder {
	const c = ((): ContainerBuilder => {
		switch (category) {
			case 'gateway':  return buildGatewayCard(d);
			case 'engine':   return buildEngineCard(d);
			case 'host':     return buildHostCard(d);
			case 'postgres': return buildPostgresCard(d);
			case 'redis':    return buildRedisCard(d);
			case 'rabbitmq': return buildRabbitCard(d);
			case 'bot':      return buildBotCard(d);
		}
	})();

	c.addSeparatorComponents(sep(true));
	c.addActionRowComponents(
		new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
			new ButtonBuilder()
				.setCustomId(`ping:overview:${userId}`)
				.setLabel('Back to Overview')
				.setEmoji('⬅️')
				.setStyle(ButtonStyle.Secondary)
		)
	);

	return c;
}
