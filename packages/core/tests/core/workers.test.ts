import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { WorkerManager, WorkerAction } from '../../src/workers/WorkerManager.js';

vi.mock('#lib/env.js', () => ({
	envParseInteger: vi.fn().mockReturnValue(2)
}));

vi.mock('@sapphire/framework', () => ({
	container: {
		logger: {
			info: vi.fn(),
			error: vi.fn()
		}
	}
}));

// Mock global Worker
class MockWorker {
	postMessage = vi.fn();
	addEventListener = vi.fn();
	terminate = vi.fn();
	constructor() {
		MockWorker.instances.push(this);
	}
	static instances: MockWorker[] = [];
	}

	(global as any).Worker = MockWorker;

	describe('WorkerManager', () => {	beforeEach(() => {
		vi.resetAllMocks();
		MockWorker.instances = [];
	});

	it('should initialize workers based on count', () => {
		const manager = new WorkerManager(3);
		expect(MockWorker.instances.length).toBe(3);
		manager.destroy();
	});

	it('should dispatch messages and resolve responses', async () => {
		const manager = new WorkerManager(1);
		const worker = MockWorker.instances[0];
		
		// Capture the message listener
		const messageListener = worker.addEventListener.mock.calls.find(call => call[0] === 'message')[1];

		const sendPromise = manager.send(WorkerAction.PING, {});

		// Get the sent request ID
		const request = worker.postMessage.mock.calls[0][0];
		const id = request.id;

		// Simulate worker response
		messageListener({
			data: { id, success: true, data: 'pong' }
		});

		const result = await sendPromise;
		expect(result).toBe('pong');
		manager.destroy();
	});

	it('should handle worker errors', async () => {
		const manager = new WorkerManager(1);
		const worker = MockWorker.instances[0];
		
		const messageListener = worker.addEventListener.mock.calls.find(call => call[0] === 'message')[1];

		const sendPromise = manager.send(WorkerAction.PING, {});

		const request = worker.postMessage.mock.calls[0][0];
		const id = request.id;

		// Simulate worker error response
		messageListener({
			data: { id, success: false, error: 'Fail' }
		});

		await expect(sendPromise).rejects.toThrow('Fail');
		manager.destroy();
	});
});
