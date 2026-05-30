import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkerManager, WorkerAction } from '../../src/workers/WorkerManager.js';

vi.mock('#lib/env.js', () => ({
	envParseInteger: vi.fn().mockReturnValue(2)
}));

vi.mock('@sapphire/framework', () => ({
	container: {
		logger: {
			info: vi.fn(),
			warn: vi.fn(),
			error: vi.fn()
		}
	}
}));

const INIT_ACTION = '__INIT__';

// Mock global Worker that actually dispatches events to registered listeners so
// the WorkerManager's __INIT__ handshake + job round-trip can be driven from tests.
class MockWorker {
	static instances: MockWorker[] = [];
	listeners: Record<string, Array<(e: { data: unknown }) => void>> = {};
	postMessage = vi.fn();
	terminate = vi.fn();
	addEventListener = vi.fn((event: string, cb: (e: { data: unknown }) => void) => {
		(this.listeners[event] ??= []).push(cb);
	});
	removeEventListener = vi.fn((event: string, cb: (e: { data: unknown }) => void) => {
		this.listeners[event] = (this.listeners[event] ?? []).filter((l) => l !== cb);
	});
	emit(event: string, data: unknown) {
		for (const cb of [...(this.listeners[event] ?? [])]) cb({ data });
	}

	constructor() {
		MockWorker.instances.push(this);
	}

	/** All messages posted with the given action. */
	postsFor(action: string) {
		return this.postMessage.mock.calls.map((c) => c[0]).filter((m) => m.action === action);
	}
}

(global as any).Worker = MockWorker;

/** Resolve the one-shot `__INIT__` handshake so queued jobs get dispatched. */
function completeInit(worker: MockWorker) {
	const [init] = worker.postsFor(INIT_ACTION);
	expect(init).toBeDefined();
	worker.emit('message', { id: init.id, success: true });
}

describe('WorkerManager', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		MockWorker.instances = [];
	});

	it('should spawn workers lazily on first dispatch, honoring the count', async () => {
		const manager = new WorkerManager(3);
		// Lazy: nothing spawned until the first job is dispatched.
		expect(MockWorker.instances.length).toBe(0);

		// Triggers #ensureSpawned synchronously; swallow the eventual Destroyed rejection.
		void manager.send(WorkerAction.PING, {}).catch(() => undefined);
		expect(MockWorker.instances.length).toBe(3);

		await manager.destroy();
	});

	it('should dispatch messages and resolve responses', async () => {
		const manager = new WorkerManager(1);

		const sendPromise = manager.send(WorkerAction.PING, {});
		const worker = MockWorker.instances[0];

		// Resolve init, then wait for #process to post the real job after readyPromise settles.
		completeInit(worker);
		await vi.waitFor(() => expect(worker.postsFor(WorkerAction.PING).length).toBe(1));

		const [job] = worker.postsFor(WorkerAction.PING);
		worker.emit('message', { id: job.id, success: true, data: 'pong' });

		const result = await sendPromise;
		expect(result).toBe('pong');
		await manager.destroy();
	});

	it('should handle worker errors', async () => {
		const manager = new WorkerManager(1);

		const sendPromise = manager.send(WorkerAction.PING, {});
		const worker = MockWorker.instances[0];

		completeInit(worker);
		await vi.waitFor(() => expect(worker.postsFor(WorkerAction.PING).length).toBe(1));

		const [job] = worker.postsFor(WorkerAction.PING);
		worker.emit('message', { id: job.id, success: false, error: 'Fail' });

		await expect(sendPromise).rejects.toThrow('Fail');
		await manager.destroy();
	});
});
