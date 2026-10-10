import type { AddonRpcMethod } from "@lumi/contracts";

export interface RpcEnvelope {
  id: string;
  action: AddonRpcMethod;
  data: unknown;
  invocationId: string | undefined;
}

export interface RpcTransport {
  currentInvocation(): string | undefined;
  runWithInvocation<T>(invocationId: string, fn: () => Promise<T>): Promise<T>;
  send(envelope: RpcEnvelope): Promise<unknown>;
}

let transport: RpcTransport | undefined;

export function setRpcTransport(t: RpcTransport): void {
  transport = t;
}

function activeTransport(): RpcTransport {
  if (!transport) throw new Error("Addon RPC transport not initialised");
  return transport;
}

export function withInvocation<T>(invocationId: string, fn: () => Promise<T>): Promise<T> {
  return activeTransport().runWithInvocation(invocationId, fn);
}

let seq = 0;

export function call<T = unknown>(action: AddonRpcMethod, data?: unknown): Promise<T> {
  const t = activeTransport();
  return t.send({
    id: `c${++seq}`,
    action,
    data,
    invocationId: t.currentInvocation(),
  }) as Promise<T>;
}
