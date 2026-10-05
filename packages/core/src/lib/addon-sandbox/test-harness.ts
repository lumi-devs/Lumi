import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type {
  AddonInvocation,
  AddonReady,
  AddonRpcRequest,
  ChildToHost,
  HostToChild,
} from "@lumi/contracts";
import { RpcFailureCodes } from "@lumi/contracts/rpc";
import { childEnv } from "./AddonHost.js";

export const AddonChildEntry = fileURLToPath(
  new URL("../../runtime/addon-child.ts", import.meta.url),
);

export interface FakeAddonHostOptions {
  name: string;
  dir: string;
  /**
   * Answers an `rpc-request` the addon makes. Defaults to a no-op success
   * (`data: null`) for every action - enough for an addon that reads config
   * or replies without caring what comes back. Throw to produce a failure
   * response instead.
   */
  onRpcRequest?: (request: AddonRpcRequest) => unknown;
}

/**
 * Drives a real addon child process (`packages/core/src/runtime/addon-child.ts`)
 * over its IPC protocol with a fake host that answers `rpc-request`s instead of
 * touching Discord/Postgres/Valkey - the harness `child.test.ts` and `lumi addon
 * test` both drive, so the protocol only has one implementation.
 */
export class FakeAddonHost {
  readonly messages: ChildToHost[] = [];
  readonly rpcRequests: AddonRpcRequest[] = [];

  #child: ChildProcess;
  #ready = Promise.withResolvers<AddonReady>();
  #pending = new Map<string, PromiseWithResolvers<void>>();
  #exited = false;

  constructor(options: FakeAddonHostOptions) {
    this.#child = spawn(process.execPath, [AddonChildEntry], {
      ...(existsSync(options.dir) && { cwd: options.dir }),
      env: childEnv({ name: options.name, dir: options.dir }),
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    });

    this.#child.on("message", (message: ChildToHost) => {
      this.messages.push(message);
      switch (message.type) {
        case "ready":
          this.#ready.resolve(message);
          return;
        case "load-failed":
          this.#ready.reject(new Error(message.error));
          return;
        case "rpc-request":
          this.rpcRequests.push(message.request);
          this.#answer(message.request, options.onRpcRequest);
          return;
        case "invocation-done": {
          const pending = this.#pending.get(message.invocationId);
          if (!pending) return;
          this.#pending.delete(message.invocationId);
          if (message.error) pending.reject(new Error(message.error));
          else pending.resolve();
        }
      }
    });

    this.#child.on("exit", (code) => {
      this.#exited = true;
      const err = new Error(`Addon child exited (${code ?? "null"})`);
      this.#ready.reject(err);
      for (const pending of this.#pending.values()) pending.reject(err);
      this.#pending.clear();
    });
  }

  #answer(request: AddonRpcRequest, onRpcRequest?: (request: AddonRpcRequest) => unknown): void {
    try {
      const data = onRpcRequest ? onRpcRequest(request) : null;
      this.#send({ type: "rpc-response", response: { id: request.id, ok: true, data } });
    } catch (err: unknown) {
      this.#send({
        type: "rpc-response",
        response: {
          id: request.id,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
          code: RpcFailureCodes.HandlerError,
          retryable: false,
        },
      });
    }
  }

  /** Resolves once the addon reports `ready`, or rejects on `load-failed`/exit. */
  ready(): Promise<AddonReady> {
    return this.#ready.promise;
  }

  /** Sends an invocation and resolves once the addon reports `invocation-done` for it. */
  invoke(invocation: AddonInvocation): Promise<void> {
    const pending = Promise.withResolvers<void>();
    this.#pending.set(invocation.invocationId, pending);
    this.#send({ type: "invoke", invocation });
    return pending.promise;
  }

  /** Every RPC action the addon called so far, in order. */
  rpcCalls(): string[] {
    return this.rpcRequests.map((r) => r.action);
  }

  stop(): void {
    if (this.#exited) return;
    this.#send({ type: "shutdown" });
    this.#child.kill();
  }

  #send(message: HostToChild): void {
    if (!this.#exited) this.#child.send(message);
  }
}
