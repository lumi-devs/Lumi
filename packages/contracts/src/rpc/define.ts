import type { z } from "zod";

/**
 * Who may call an action. `guildManager` needs a guild the actor manages,
 * `botOwner` needs a bot owner, `session` only needs a signed-in actor, and
 * `public` needs nothing (the handler authorizes some other way, e.g. a signed
 * token).
 */
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
  permission?: string;
  requiresEnabled?: string;
  timeoutMs: number;
  summary: string;
  /**
   * True only for a pure read with no side effect worth worrying about on a
   * duplicate call - the one thing `RpcClient`'s opt-in retry is allowed to
   * repeat on a transport failure. Left unset (falsy) for anything that
   * writes, even idempotent writes like `guild.config.set`: a retry there
   * could double a side effect (e.g. re-sending a notification) the handler
   * doesn't dedupe on its own.
   */
  readOnly?: boolean;
  idempotent?: boolean;
  audit?: string;
}

export interface RpcActionDef<
  V extends RpcInputValidator,
  A extends RpcAuth,
  O extends object,
> extends RpcActionOptions<V, A> {
  /** Never set at runtime; carries the response type. */
  readonly output?: O;
}

/** Curried so the output type is explicit while input and auth are inferred. */
export function rpcAction<O extends object>() {
  return <A extends RpcAuth, V extends RpcInputValidator = undefined>(
    options: RpcActionOptions<V, A>,
  ): RpcActionDef<V, A, O> => options;
}

export interface RpcSliceEntry {
  input?: z.ZodType<unknown>;
  auth: RpcAuth;
  permission?: string;
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
