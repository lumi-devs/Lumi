import type { z } from "zod";

export type RpcAuth = "guildManager" | "botOwner" | "session" | "public";

export const RpcTimeouts = {
  short: 8_000,
  medium: 12_000,
  long: 15_000,
  bulk: 120_000,
} as const;

type RpcInputValidator = z.ZodType<unknown> | undefined;

interface RpcActionOptions<V extends RpcInputValidator, A extends RpcAuth> {
  input?: V;
  auth: A;
  requiresEnabled?: string;
  timeoutMs: number;
  summary: string;

  readOnly?: boolean;
  idempotent?: boolean;
  audit?: string;
}

export interface RpcActionDef<
  V extends RpcInputValidator,
  A extends RpcAuth,
  O extends object,
> extends RpcActionOptions<V, A> {

  readonly output?: O;
}

export function rpcAction<O extends object>() {
  return <A extends RpcAuth, V extends RpcInputValidator = undefined>(
    options: RpcActionOptions<V, A>,
  ): RpcActionDef<V, A, O> => options;
}

export interface RpcSliceEntry {
  input?: z.ZodType<unknown>;
  auth: RpcAuth;
  requiresEnabled?: string;
  timeoutMs: number;
  summary: string;
  readOnly?: boolean;
  idempotent?: boolean;
  audit?: string;
}

export type RpcInputOf<E> =
  E extends RpcActionDef<infer V, RpcAuth, object>
    ? V extends z.ZodType<unknown>
      ? z.infer<V>
      : undefined
    : never;

export type RpcOutputOf<E> =
  E extends RpcActionDef<RpcInputValidator, RpcAuth, infer O> ? O : never;
