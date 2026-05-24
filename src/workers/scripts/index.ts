// / <reference lib="webworker" />
declare const self: Worker;

import type { WorkerRequest, WorkerResponse } from "../WorkerManager.js";
import { WorkerAction } from "../WorkerManager.js";

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { id, action } = event.data;

  try {
    let data: unknown;

    switch (action) {
      case WorkerAction.PING:
        data = "pong";
        break;
      case WorkerAction.MODERATION_FILTER:
        // Example: heavy regex filtering logic would go here
        data = { clean: true };
        break;
      default:
        throw new Error(`Unknown action: ${action}`);
    }

    self.postMessage({ id, success: true, data } satisfies WorkerResponse);
  } catch (err: unknown) {
    const error = err as Error;
    self.postMessage({
      id,
      action,
      error: error.message ?? "Unknown worker error",
    });
  }
};
