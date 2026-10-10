import { randomUUID } from "node:crypto";
import { CONTRACT_VERSION } from "../version.js";
import {
  parseRpcResponse,
  RpcFailureCodes,
  RpcRetryableByDefault,
  type RpcFailureCode,
  type RpcRequest,
} from "./envelope.js";
import { rpcRouter, type RpcActionName, type RpcInput, type RpcOutput } from "./router.js";

export type RpcErrorCode = "TIMEOUT" | "WORKER_DOWN" | "MALFORMED" | RpcFailureCode;

/**
 * Default retryability for the client-only codes (the transport never got a
 * server envelope to read `retryable` off): a timeout or a refused/dropped
 * connection is exactly the "worth retrying" case, an undecodable body is
 * not - retrying the same malformed response gets the same result.
 */
const ClientOnlyRetryableByDefault = {
  TIMEOUT: true,
  WORKER_DOWN: true,
  MALFORMED: false,
} as const satisfies Record<"TIMEOUT" | "WORKER_DOWN" | "MALFORMED", boolean>;

function isClientOnlyCode(
  code: RpcErrorCode,
): code is keyof typeof ClientOnlyRetryableByDefault {
  return code in ClientOnlyRetryableByDefault;
}

function retryableForCode(code: RpcErrorCode): boolean {
  return isClientOnlyCode(code)
    ? ClientOnlyRetryableByDefault[code]
    : RpcRetryableByDefault[code];
}

export interface RpcErrorOptions {
  retryable?: boolean;
  retryAfterMs?: number;
}

export class RpcError extends Error {
  public readonly code: RpcErrorCode;
  public readonly action: string;
  public readonly retryable: boolean;
  public readonly retryAfterMs?: number;
  public constructor(
    code: RpcErrorCode,
    action: string,
    message?: string,
    options?: RpcErrorOptions,
  ) {
    super(message ?? `RPC ${action}: ${code}`);
    this.name = "RpcError";
    this.code = code;
    this.action = action;
    this.retryable = options?.retryable ?? retryableForCode(code);
    this.retryAfterMs = options?.retryAfterMs;
  }
}

/**
 * True when the bot itself reported it cannot see the guild. Every other
 * failure — worker down, timeout, database error — means the request could not
 * be answered, which is a different thing to tell the user.
 */
export function isGuildMissing(err: unknown): boolean {
  return err instanceof RpcError && err.code === RpcFailureCodes.GuildNotFound;
}

/**
 * True when the server rejected this caller's `@lumi/contracts` version as
 * incompatible with its own. `err.message` already names both versions
 * (built server-side, see `packages/core/src/lib/rpc/http-server.ts`) — this
 * only tells a caller when to show that message instead of a generic
 * "something went wrong".
 */
export function isContractMismatch(err: unknown): boolean {
  return err instanceof RpcError && err.code === RpcFailureCodes.ContractMismatch;
}

type CallOptions<A extends RpcActionName> = {
  guildId?: string;
  actorId?: string;
} & (RpcInput<A> extends undefined ? { data?: undefined } : { data: RpcInput<A> });

export type RpcCircuitState = "closed" | "open" | "half-open";

export interface RpcCircuitBreakerOptions {
  /** Consecutive transport failures before the breaker trips from `closed` to `open`. */
  failureThreshold: number;
  /** How long the breaker stays `open` before allowing a single `half-open` probe. */
  cooldownMs: number;
}

const DefaultBreakerOptions: RpcCircuitBreakerOptions = {
  failureThreshold: 5,
  cooldownMs: 10_000,
};

/**
 * Mirrors `packages/core/src/lib/utilities/resilience.ts`'s `CircuitBreaker`
 * semantics (closed/open/half-open, single half-open probe) without
 * importing it - `packages/contracts` must never import `packages/core` (see
 * `packages/core/tests/architecture/import-graph.test.ts`), so this is a
 * small, deliberately duplicated copy scoped to the client's own transport
 * failures rather than a generic reusable gate.
 */
class RpcCircuitBreaker {
  private readonly failureThreshold: number;
  private readonly cooldownMs: number;
  private state: RpcCircuitState = "closed";
  private consecutiveFailures = 0;
  private openedAt = 0;
  private halfOpenProbeInFlight = false;

  public constructor(options: RpcCircuitBreakerOptions) {
    this.failureThreshold = options.failureThreshold;
    this.cooldownMs = options.cooldownMs;
  }

  public getState(): RpcCircuitState {
    if (this.state === "open" && Date.now() - this.openedAt >= this.cooldownMs) {
      this.state = "half-open";
      this.halfOpenProbeInFlight = false;
    }
    return this.state;
  }

  public remainingCooldownMs(): number {
    return Math.max(0, this.cooldownMs - (Date.now() - this.openedAt));
  }

  public tryAcquire(): boolean {
    const state = this.getState();
    if (state === "open") return false;
    if (state === "half-open") {
      if (this.halfOpenProbeInFlight) return false;
      this.halfOpenProbeInFlight = true;
    }
    return true;
  }

  public onSuccess(): void {
    this.consecutiveFailures = 0;
    this.state = "closed";
    this.halfOpenProbeInFlight = false;
  }

  public onFailure(): void {
    if (this.state === "half-open") {
      this.trip();
      return;
    }
    this.consecutiveFailures++;
    if (this.consecutiveFailures >= this.failureThreshold) {
      this.trip();
    }
    this.halfOpenProbeInFlight = false;
  }

  private trip(): void {
    this.state = "open";
    this.openedAt = Date.now();
    this.consecutiveFailures = 0;
    this.halfOpenProbeInFlight = false;
  }
}

export interface RpcRetryOptions {
  /** Total attempts, including the first - 1 means "no retry". */
  attempts: number;
  /** Base delay for jittered exponential backoff between attempts. */
  baseDelayMs: number;
}

export interface RpcClientOptions {
  baseUrl: string;
  token?: string;
  logger?: (msg: string) => void;
  /** Lets a caller stamp W3C trace headers onto the outgoing request without this package depending on a tracing library. */
  injectTraceHeaders?: () => { traceparent?: string; tracestate?: string };
  /**
   * Fails fast instead of piling up timeouts against a down `apps/api`.
   * `false` disables it entirely. On by default (5 consecutive transport
   * failures, 10s cooldown) since every caller benefits from not queuing
   * requests behind a dead server.
   */
  breaker?: RpcCircuitBreakerOptions | false;
  /**
   * Retries a request on a retryable transport failure (`TIMEOUT` /
   * `WORKER_DOWN`) - only ever applied to actions the router marks
   * `readOnly` (see `packages/contracts/src/rpc/define.ts`), since a mutation
   * retried after a dropped response could double its side effect. Off by
   * default; retries never push the total wall-clock time for a call past
   * its own `timeoutMs` budget.
   */
  retry?: RpcRetryOptions;
}

function isRetryableForRetry(err: unknown): boolean {
  return err instanceof RpcError && err.retryable;
}

const MaxBodyBytes = 10 * 1024 * 1024;

async function readBoundedText(res: Response): Promise<string> {
  const declared = res.headers.get("content-length");
  if (declared !== null && Number(declared) > MaxBodyBytes) {
    throw new Error(`response exceeds ${MaxBodyBytes} bytes`);
  }
  if (!res.body) throw new Error("response has no body");
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MaxBodyBytes) {
      void reader.cancel();
      throw new Error(`response exceeds ${MaxBodyBytes} bytes`);
    }
    chunks.push(value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(body);
}

function jitteredBackoff(baseDelayMs: number, attempt: number): number {
  const exponential = baseDelayMs * 2 ** (attempt - 1);
  return exponential * (0.5 + Math.random() * 0.5);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Talks to `apps/api`'s internal HTTP RPC server over plain HTTP. Carries no
 * knowledge of its caller's runtime — no `server-only`, no env module, no
 * process-wide singleton — those are the caller's concerns.
 *
 * `actorId` on the wire is an unsigned claim, so the server only honours it
 * from callers holding its shared internal token, sent here as a bearer token.
 */
export class RpcClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly log: (msg: string) => void;
  private readonly injectTraceHeaders: () => { traceparent?: string; tracestate?: string };
  private readonly breaker?: RpcCircuitBreaker;
  private readonly retry?: RpcRetryOptions;

  public constructor(options: RpcClientOptions) {
    this.baseUrl = options.baseUrl;
    this.token = options.token ?? "";
    this.log = options.logger ?? (() => {});
    this.injectTraceHeaders = options.injectTraceHeaders ?? (() => ({}));
    const breakerOptions = options.breaker === undefined ? DefaultBreakerOptions : options.breaker;
    this.breaker = breakerOptions === false ? undefined : new RpcCircuitBreaker(breakerOptions);
    this.retry = options.retry;
  }

  /** Exposed for callers wanting to surface breaker state (e.g. a health widget); not used internally beyond `invoke`. */
  public breakerState(): RpcCircuitState | "disabled" {
    return this.breaker?.getState() ?? "disabled";
  }

  private buildRequest(
    action: string,
    guildId: string | undefined,
    actorId: string | undefined,
    data: unknown,
  ): RpcRequest {
    const traceCarrier = this.injectTraceHeaders();
    return {
      id: randomUUID(),
      action,
      guildId,
      actorId,
      traceparent: traceCarrier.traceparent,
      tracestate: traceCarrier.tracestate,
      data,
    };
  }

  private async post(action: string, request: RpcRequest, timeoutMs: number): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/rpc`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "connection": "keep-alive",
          "x-lumi-contract-version": CONTRACT_VERSION,
          ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      });
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new RpcError("TIMEOUT", action, `RPC timed out: ${action}`);
      }
      throw new RpcError("WORKER_DOWN", action, err instanceof Error ? err.message : String(err));
    } finally {
      clearTimeout(timer);
    }

    let text: string;
    try {
      text = await readBoundedText(res);
    } catch (err: unknown) {
      this.log(`Discarding oversized RPC response: ${String(err)}`);
      throw new RpcError("MALFORMED", action, `RPC ${action}: malformed response`);
    }
    try {
      return JSON.parse(text) as unknown;
    } catch (err: unknown) {
      this.log(`Discarding undecodable RPC response: ${String(err)}`);
      throw new RpcError("MALFORMED", action, `RPC ${action}: malformed response`);
    }
  }

  private async attemptInvoke<A extends RpcActionName>(
    action: A,
    options: CallOptions<A>,
    timeoutMs: number,
  ): Promise<RpcOutput<A>> {
    if (this.breaker && !this.breaker.tryAcquire()) {
      throw new RpcError("WORKER_DOWN", action, `RPC ${action}: circuit breaker open`, {
        retryable: true,
        retryAfterMs: this.breaker.remainingCooldownMs(),
      });
    }

    let raw: unknown;
    try {
      raw = await this.post(
        action,
        this.buildRequest(action, options.guildId, options.actorId, options.data),
        timeoutMs,
      );
    } catch (err: unknown) {
      if (this.breaker && err instanceof RpcError && (err.code === "TIMEOUT" || err.code === "WORKER_DOWN")) {
        this.breaker.onFailure();
      }
      throw err;
    }
    // Transport got a response at all, so the api is up regardless of what's in it.
    this.breaker?.onSuccess();

    let response;
    try {
      response = parseRpcResponse(raw);
    } catch (err: unknown) {
      this.log(`Discarding malformed RPC envelope for ${action}: ${String(err)}`);
      throw new RpcError("MALFORMED", action, `RPC ${action}: malformed response`);
    }
    if (!response.ok) {
      if (response.code === RpcFailureCodes.ContractMismatch) {
        this.log(`[RpcClient] Contract version mismatch for action "${action}": ${response.error}`);
      }
      throw new RpcError(response.code, action, response.error, {
        retryable: response.retryable,
        retryAfterMs: response.retryAfterMs,
      });
    }
    if (response.data === undefined || response.data === null) {
      this.log(`RPC ${action}: response ok but missing expected data`);
      throw new RpcError("MALFORMED", action, `RPC ${action}: response missing expected data`);
    }
    return response.data as RpcOutput<A>;
  }

  public async invoke<A extends RpcActionName>(
    action: A,
    options: CallOptions<A>,
  ): Promise<RpcOutput<A>> {
    const timeoutMs = rpcRouter[action].timeoutMs;
    const isReadOnly = Boolean((rpcRouter[action] as { readOnly?: boolean }).readOnly);
    const retryCfg = isReadOnly ? this.retry : undefined;
    const maxAttempts = retryCfg ? Math.max(1, retryCfg.attempts) : 1;
    const deadlineAt = Date.now() + timeoutMs;

    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const remaining = deadlineAt - Date.now();
      if (attempt > 1 && remaining <= 0) {
        throw lastError;
      }
      try {
        return await this.attemptInvoke(action, options, Math.min(timeoutMs, Math.max(remaining, 1)));
      } catch (err) {
        lastError = err;
        const canRetry =
          attempt < maxAttempts && retryCfg !== undefined && isRetryableForRetry(err);
        if (!canRetry) {
          throw err;
        }
        const remainingBudget = deadlineAt - Date.now();
        const serverWait = err instanceof RpcError ? (err.retryAfterMs ?? 0) : 0;
        const backoff = Math.max(jitteredBackoff(retryCfg.baseDelayMs, attempt), serverWait);
        if (remainingBudget <= 0 || backoff >= remainingBudget) {
          throw err;
        }
        await sleep(backoff);
      }
    }
    throw lastError;
  }

  public async healthy(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/healthz`, {
        signal: AbortSignal.timeout(2000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}
