// / <reference lib="webworker" />
declare const self: Worker;

import type { WorkerRequest, WorkerResponse } from "../types.js";

interface HandlerInit {
  action: string;
  modulePath: string;
}

type Handler = (payload: unknown) => unknown | Promise<unknown>;

const handlers = new Map<string, Handler>();
// PING is always available so the manager can sanity-check a freshly spawned
// worker without depending on any module-supplied registration.
handlers.set("PING", () => "pong");

let initialized = false;
const queued: MessageEvent<WorkerRequest>[] = [];

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { id, action, payload } = event.data;

  if (action === "__INIT__") {
    void initHandlers(id, payload as HandlerInit[]);
    return;
  }

  if (!initialized) {
    // Module registrations from the main thread arrive via __INIT__; until
    // that lands we queue dispatches rather than reject so callers that race
    // the worker boot don't see spurious "unknown action" errors.
    queued.push(event);
    return;
  }

  void dispatch(id, action, payload);
};

async function initHandlers(id: string, list: HandlerInit[]): Promise<void> {
  for (const h of list) {
    try {
      const mod = (await import(h.modulePath)) as { default?: Handler };
      if (typeof mod.default !== "function") {
        throw new Error(
          `worker handler ${h.action}: module ${h.modulePath} has no default export`,
        );
      }
      handlers.set(h.action, mod.default);
    } catch (err: unknown) {
      const error = err as Error;
      self.postMessage({
        id,
        success: false,
        error: `Failed to load handler ${h.action}: ${error.message}`,
      } satisfies WorkerResponse);
      return;
    }
  }
  initialized = true;
  self.postMessage({
    id,
    success: true,
    data: { actions: [...handlers.keys()] },
  } satisfies WorkerResponse);

  // Drain anything that landed before init completed.
  while (queued.length > 0) {
    const e = queued.shift()!;
    void dispatch(e.data.id, e.data.action, e.data.payload);
  }
}

async function dispatch(
  id: string,
  action: string,
  payload: unknown,
): Promise<void> {
  try {
    const handler = handlers.get(action);
    if (!handler) throw new Error(`Unknown action: ${action}`);
    const data = await handler(payload);
    self.postMessage({ id, success: true, data } satisfies WorkerResponse);
  } catch (err: unknown) {
    const error = err as Error;
    self.postMessage({
      id,
      success: false,
      error: error.message ?? "Unknown worker error",
    } satisfies WorkerResponse);
  }
}
