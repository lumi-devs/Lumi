import { createHash } from "node:crypto";
import type { RpcRequest, RpcResponse } from "#src/contracts/rpc/Index.ts";

export type IdempotencyDecision =
  | { kind: "execute"; release: (response: RpcResponse<unknown>) => Promise<void>; abort: () => Promise<void> }
  | { kind: "replay"; response: RpcResponse<unknown> }
  | { kind: "in_flight"; response: RpcResponse<unknown> };

function computePayloadHash(action: string, payload: unknown): string {
  return createHash("sha256").update(action).update(":").update(JSON.stringify(payload ?? null)).digest("hex");
}

export function makeIdempotencyKey(req: RpcRequest<unknown>): string {
  const hash = computePayloadHash(req.action, req.data);
  const guildId = req.guildId ?? "global";
  return `rpc:idem:${req.action}:${guildId}:${hash}`;
}

export async function withIdempotency<T>(
  _action: string,
  _guildId: string,
  _timeoutMs: number,
  _input: unknown,
  fn: () => Promise<T>,
): Promise<T> {
  return fn();
}
