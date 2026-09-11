import { AsyncLocalStorage } from "node:async_hooks";
import type { AddonRpcMethod, AddonRpcResponse, HostToChild } from "@lumi/contracts";

const CallTimeoutMs = 10_000;

interface Pending {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const pending = new Map<string, Pending>();
let seq = 0;

// Not a module variable: invocations interleave at every await, and a plain
// variable would answer one command with another's interaction.
const invocationStore = new AsyncLocalStorage<string>();

export function withInvocation<T>(invocationId: string, fn: () => Promise<T>): Promise<T> {
  return invocationStore.run(invocationId, fn);
}

export function settleRpc(response: AddonRpcResponse): void {
  const entry = pending.get(response.id);
  if (!entry) return;
  clearTimeout(entry.timer);
  pending.delete(response.id);
  if (response.ok) entry.resolve(response.data);
  else entry.reject(new Error(response.error));
}

export function call<T = unknown>(action: AddonRpcMethod, data?: unknown): Promise<T> {
  const id = `c${++seq}`;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Host call "${action}" timed out`));
    }, CallTimeoutMs);
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
    send({
      type: "rpc-request",
      request: { id, action, data, invocationId: invocationStore.getStore() },
    });
  });
}

function send(message: { type: "rpc-request"; request: unknown }): void {
  if (!process.send) throw new Error("Addon child started without an IPC channel");
  process.send(JSON.parse(JSON.stringify(message)));
}

export type { HostToChild };
