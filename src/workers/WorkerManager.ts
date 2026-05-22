import { container } from '@sapphire/framework';
import { envParseInteger } from '#lib/env.js';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

export enum WorkerAction {
	PING = 'PING',
	MODERATION_FILTER = 'MODERATION_FILTER'
}

export interface WorkerRequest {
	id: string;
	action: WorkerAction;
	payload: any;
}

export interface WorkerResponse {
	id: string;
	success: boolean;
	data?: any;
	error?: string;
}

export class WorkerManager {
	private readonly _workers: Worker[] = [];
	private readonly _pending = new Map<string, (res: WorkerResponse) => void>();
	private _nextWorker = 0;

	public constructor(count: number = envParseInteger('WORKER_COUNT', 2)) {
		const scriptPath = join(dirname(fileURLToPath(import.meta.url)), 'scripts/index.ts');

		for (let i = 0; i < count; i++) {
			const worker = new Worker(scriptPath);

			worker.addEventListener('message', (event: MessageEvent) => {
				const response = event.data as WorkerResponse;
				const resolver = this._pending.get(response.id);
				if (resolver) {
					this._pending.delete(response.id);
					resolver(response);
				}
			});

			worker.addEventListener('error', (err: ErrorEvent) => {
				container.logger.error(`[Worker ${i}] Error:`, err);
			});

			this._workers.push(worker);
		}

		container.logger.info(`[WorkerManager] Initialized with ${count} workers.`);
	}

	public async send<T = any>(action: WorkerAction, payload: any): Promise<T> {
		const id = crypto.randomUUID();
		const request: WorkerRequest = { id, action, payload };

		const promise = new Promise<WorkerResponse>((resolve) => {
			this._pending.set(id, resolve);
		});

		// Simple round-robin
		const worker = this._workers[this._nextWorker];
		this._nextWorker = (this._nextWorker + 1) % this._workers.length;

		worker.postMessage(request);

		const response = await promise;
		if (!response.success) {
			throw new Error(response.error ?? 'Unknown worker error');
		}

		return response.data as T;
	}

	public destroy() {
		for (const worker of this._workers) {
			worker.terminate();
		}
		this._workers.length = 0;
		this._pending.clear();
	}
}
