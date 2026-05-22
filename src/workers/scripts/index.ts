// / <reference lib="webworker" />
declare const self: any;

import type { WorkerRequest, WorkerResponse } from '../WorkerManager.js';
import { WorkerAction } from '../WorkerManager.js';

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
	const { id, action } = event.data;

	try {
		let data: any;

		switch (action) {
			case WorkerAction.PING:
				data = 'pong';
				break;
			case WorkerAction.MODERATION_FILTER:
				// Example: heavy regex filtering logic would go here
				data = { clean: true };
				break;
			default:
				throw new Error(`Unknown action: ${action}`);
		}

		self.postMessage({ id, success: true, data } satisfies WorkerResponse);
	} catch (err: any) {
		self.postMessage({ id, success: false, error: err.message } satisfies WorkerResponse);
	}
};
