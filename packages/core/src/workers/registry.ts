// Registry of compute-offload handlers loaded into the worker thread pool. The old
// model hardcoded a switch in `scripts/index.ts` for the two filter actions and gave
// no other module a way to add work; this lets any module contribute a handler from
// its own directory without the central script importing module code (which would
// re-introduce the cross-module dependency the module system forbids).
//
// Modules call `registerWorkerHandler` from `onLoad`; WorkerManager defers the
// worker-thread spawn until the first `send()` so every registration has landed, then
// sends each worker one `__INIT__` message with the (action, modulePath) list. The
// worker dynamic-imports each path into its dispatch map; unknown actions throw at
// dispatch time.

interface WorkerHandlerRegistration {
  action: string;
  modulePath: string;
}

const handlers = new Map<string, string>();

/**
 * Register a compute-offload handler for the worker thread pool.
 *
 * - `action` is the wire string passed to `WorkerManager.send(action, ...)`.
 * - `modulePath` must be an absolute file URL (e.g. `new URL("./aho-corasick.ts",
 *   import.meta.url).href`) — the worker thread resolves it independently.
 * - The module's default export must be a `(payload: unknown) => unknown |
 *   Promise<unknown>` function. The return value is sent back as `success.data`.
 *
 * Registering the same action twice is allowed: the later registration wins.
 * Workers spawned after a re-registration see the new path; existing workers
 * are not patched (we don't expect hot-swap to be a real requirement).
 */
export function registerWorkerHandler(
  action: string,
  modulePath: string,
): void {
  handlers.set(action, modulePath);
}

export function unregisterWorkerHandler(action: string): void {
  handlers.delete(action);
}

export function snapshotWorkerHandlers(): WorkerHandlerRegistration[] {
  return [...handlers.entries()].map(([action, modulePath]) => ({
    action,
    modulePath,
  }));
}
