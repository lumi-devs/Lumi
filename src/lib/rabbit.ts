import amqp from 'amqp-connection-manager';
import type { AmqpConnectionManager, ChannelWrapper } from 'amqp-connection-manager';
import type { Channel, ConsumeMessage } from 'amqplib';
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { container } from '@sapphire/framework';

// ─────────────────────────────────────────────────────────────────────────────
// Job queue: enqueue/handle delayed and immediate jobs.
// Module-augmentable type registry (declaration-merged by feature modules).
// ─────────────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface EmberJobs {}
export type EmberJobType = Extract<keyof EmberJobs, string>;
export type EmberJobData<T extends string> = T extends keyof EmberJobs ? EmberJobs[T] : Record<string, unknown>;

interface JobEnvelope {
	type: string;
	data: Record<string, unknown>;
}

type AnyJobHandler = (data: Record<string, unknown>) => Promise<void>;
const jobHandlers = new Map<string, AnyJobHandler>();

export function registerJobHandler<T extends string>(type: T, handler: (data: EmberJobData<T>) => Promise<void>): void {
	if (jobHandlers.has(type)) throw new Error(`[Jobs] Duplicate handler for "${type}"`);
	jobHandlers.set(type, handler as AnyJobHandler);
}

export async function enqueueJob<T extends string>(type: T, data: EmberJobData<T>, delayMs?: number): Promise<void> {
	const rabbit = container.rabbit;
	if (!rabbit) throw new Error(`[Jobs] Cannot enqueue "${type}" — RabbitMQ not configured`);

	const envelope: JobEnvelope = { type, data: data as Record<string, unknown> };

	if (delayMs && delayMs > 0) {
		await rabbit.channel.sendToQueue('ember.jobs.delayed', envelope, {
			expiration: String(Math.round(delayMs)),
			persistent: true
		});
	} else {
		await rabbit.channel.publish('ember.jobs', 'active', envelope, { persistent: true });
	}
}

function startJobWorker(channel: ChannelWrapper): void {
	void channel.addSetup(async (ch: Channel) => {
		await ch.prefetch(10);
		await ch.consume('ember.jobs.active', (msg) => handleJob(ch, msg));
	});
	container.logger.info('[Rabbit] job worker listening on ember.jobs.active');
}

function handleJob(ch: Channel, msg: ConsumeMessage | null): void {
	if (!msg) return;

	void (async () => {
		let job: JobEnvelope;
		try {
			job = JSON.parse(msg.content.toString()) as JobEnvelope;
		} catch {
			container.logger.warn('[Jobs] malformed payload — discarding');
			ch.nack(msg, false, false);
			return;
		}

		const handler = jobHandlers.get(job.type);
		if (!handler) {
			container.logger.warn(`[Jobs] no handler for "${job.type}" — discarding`);
			ch.nack(msg, false, false);
			return;
		}

		try {
			await handler(job.data);
			ch.ack(msg);
			container.logger.debug(`[Jobs] ✓ ${job.type}`);
		} catch (err) {
			container.logger.error(`[Jobs] ✗ ${job.type}:`, err);
			// Requeue once; if redelivered, drop.
			ch.nack(msg, false, !msg.fields.redelivered);
		}
	})();
}

// ─────────────────────────────────────────────────────────────────────────────
// RPC registry: transport-agnostic dispatch.
// Action names follow `<domain>.<resource>.<verb>`.
// ─────────────────────────────────────────────────────────────────────────────

export interface RpcRequest<T = unknown> {
	id: string;
	action: string;
	guildId?: string;
	actorId?: string;
	data?: T;
}

export interface RpcResponse<T = unknown> {
	id: string;
	ok: boolean;
	data?: T;
	error?: string;
}

export type RpcHandler<TIn = any, TOut = unknown> = (req: RpcRequest<TIn>) => Promise<TOut> | TOut;

const rpcHandlers = new Map<string, RpcHandler<any, any>>();

export function registerRpcHandler<TIn, TOut>(action: string, handler: RpcHandler<TIn, TOut>): void {
	if (rpcHandlers.has(action)) throw new Error(`[RPC] Duplicate registration for action "${action}"`);
	rpcHandlers.set(action, handler as RpcHandler);
}

async function dispatchRpc<T = unknown>(req: RpcRequest): Promise<RpcResponse<T>> {
	const handler = rpcHandlers.get(req.action);
	if (!handler) return { id: req.id, ok: false, error: `Unknown action: ${req.action}` };

	try {
		const data = (await handler(req)) as T;
		return { id: req.id, ok: true, data };
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Internal error';
		container.logger.error(`[RPC] ${req.action} failed:`, err);
		return { id: req.id, ok: false, error: message };
	}
}

// AMQP RPC server — consumes `ember.rpc.requests`, replies via reply-to.
function startRpcServer(channel: ChannelWrapper): void {
	void channel.addSetup(async (ch: Channel) => {
		await ch.prefetch(8);
		await ch.consume('ember.rpc.requests', (msg) => handleRpc(ch, msg));
	});
	container.logger.info('[Rabbit] RPC server listening on ember.rpc.requests');
}

function handleRpc(ch: Channel, msg: ConsumeMessage | null): void {
	if (!msg) return;

	void (async () => {
		let req: RpcRequest;
		try {
			const body = JSON.parse(msg.content.toString()) as Partial<RpcRequest>;
			if (typeof body.action !== 'string') throw new Error('missing action');
			req = {
				id: body.id ?? randomUUID(),
				action: body.action,
				guildId: body.guildId,
				actorId: body.actorId,
				data: body.data
			};
		} catch (err) {
			container.logger.warn('[Rabbit RPC] malformed request — discarding:', err);
			ch.nack(msg, false, false);
			return;
		}

		container.logger.debug(`[Rabbit RPC] ${req.action} id=${req.id} guild=${req.guildId ?? 'global'}`);
		const response = await dispatchRpc(req);

		if (msg.properties.replyTo) {
			ch.sendToQueue(msg.properties.replyTo, Buffer.from(JSON.stringify(response)), {
				correlationId: msg.properties.correlationId
			});
		}
		ch.ack(msg);
	})();
}

// ─────────────────────────────────────────────────────────────────────────────
// RabbitClient — owns the connection, channel, topology, and consumers.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Topology owned by Ember:
 *
 *   ember.events           fanout   — broadcast bus (dashboard / analytics / logs)
 *   ember.rpc.requests     queue    — dashboard → bot RPC requests (Direct Reply-To)
 *   ember.jobs             direct   — job exchange
 *   ember.jobs.active      queue    — workers consume from here
 *   ember.jobs.delayed     queue    — TTL waiting room; DLX → ember.jobs (key 'active')
 *
 * Single owner of the topology, single owner of the RPC reply-to consumer.
 * Spawns RPC server + job worker on startup; drains cleanly on close.
 */
export class RabbitClient {
	public readonly connection: AmqpConnectionManager;
	public readonly channel: ChannelWrapper;
	private readonly _replies = new EventEmitter();

	public constructor(url: string) {
		this.connection = amqp.connect([url], { heartbeatIntervalInSeconds: 15, reconnectTimeInSeconds: 5 });

		this.connection.on('connect', () => container.logger.info('[Rabbit] connected'));
		this.connection.on('disconnect', ({ err }) => container.logger.warn(`[Rabbit] disconnect: ${err?.message ?? 'unknown'} — reconnecting…`));
		this.connection.on('connectFailed', ({ err }) => container.logger.error(`[Rabbit] connect failed: ${err?.message}`));

		this.channel = this.connection.createChannel({
			json: true,
			setup: (ch: Channel) => this._declareTopology(ch)
		});

		this._replies.setMaxListeners(0);
	}

	public waitForConnect(): Promise<void> {
		return this.channel.waitForConnect();
	}

	/** Broadcast an event to every dashboard / worker bound to the fanout. */
	public publishEvent(event: string, payload: Record<string, unknown> = {}): Promise<boolean> {
		return this.channel.publish('ember.events', '', { event, ts: Date.now(), ...payload });
	}

	/** Send an RPC request and await the reply. */
	public request<T = unknown>(action: string, payload: Record<string, unknown> = {}, timeoutMs = 5_000): Promise<T> {
		return new Promise<T>((resolve, reject) => {
			const correlationId = randomUUID();
			const timer = setTimeout(() => {
				this._replies.removeAllListeners(correlationId);
				reject(new Error(`Rabbit RPC timeout (${timeoutMs}ms): ${action}`));
			}, timeoutMs);

			this._replies.once(correlationId, (response: T) => {
				clearTimeout(timer);
				resolve(response);
			});

			void this.channel.sendToQueue(
				'ember.rpc.requests',
				{ action, ...payload },
				{ correlationId, replyTo: 'amq.rabbitmq.reply-to' }
			);
		});
	}

	public async close(): Promise<void> {
		await this.channel.close().catch(() => undefined);
		await this.connection.close().catch(() => undefined);
		container.logger.info('[Rabbit] closed');
	}

	private async _declareTopology(ch: Channel): Promise<void> {
		await Promise.all([
			ch.assertExchange('ember.events', 'fanout', { durable: true }),

			ch.assertQueue('ember.rpc.requests', { durable: true, maxPriority: 10 }),

			ch.assertExchange('ember.jobs', 'direct', { durable: true }),
			ch.assertQueue('ember.jobs.active', { durable: true }),
			ch.bindQueue('ember.jobs.active', 'ember.jobs', 'active'),
			ch.assertQueue('ember.jobs.delayed', {
				durable: true,
				arguments: {
					'x-dead-letter-exchange': 'ember.jobs',
					'x-dead-letter-routing-key': 'active'
				}
			}),

			// Direct Reply-To: virtual queue, no declaration, just consume.
			ch.consume(
				'amq.rabbitmq.reply-to',
				(msg: ConsumeMessage | null) => {
					if (!msg?.properties.correlationId) return;
					try {
						this._replies.emit(msg.properties.correlationId, JSON.parse(msg.content.toString()));
					} catch (err) {
						container.logger.warn('[Rabbit] malformed reply payload:', err);
					}
				},
				{ noAck: true }
			)
		]);

		startRpcServer(this.channel);
		startJobWorker(this.channel);
	}
}
