import type { BaseValidator, Unwrap } from "@sapphire/shapeshift";

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

type RpcInputValidator = BaseValidator<unknown> | undefined;

interface RpcActionOptions<V extends RpcInputValidator> {
  input?: V;
  auth: RpcAuth;
  /** Name of the module that must be loaded before the handler runs. */
  requiresEnabled?: string;
  timeoutMs: number;
  summary: string;
}

export interface RpcActionDef<V extends RpcInputValidator, O extends object>
  extends RpcActionOptions<V> {
  /** Never set at runtime; carries the response type. */
  readonly output?: O;
}

/** Curried so the output type is explicit while the input type is inferred from the validator. */
export function rpcAction<O extends object>() {
  return <V extends RpcInputValidator = undefined>(
    options: RpcActionOptions<V>,
  ): RpcActionDef<V, O> => options;
}

export interface RpcSliceEntry {
  input?: { parse(value: unknown): unknown };
  auth: RpcAuth;
  requiresEnabled?: string;
  timeoutMs: number;
  summary: string;
}

export type RpcSlice = Record<string, RpcSliceEntry>;

export type RpcInputOf<E> =
  E extends RpcActionDef<infer V, object>
    ? V extends BaseValidator<unknown>
      ? Unwrap<V>
      : undefined
    : never;

export type RpcOutputOf<E> =
  E extends RpcActionDef<RpcInputValidator, infer O> ? O : never;
