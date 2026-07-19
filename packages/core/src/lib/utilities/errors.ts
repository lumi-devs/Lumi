import { container } from "@sapphire/framework";

export function errorFrom(err: unknown): Error {
  if (err instanceof Error) return err;
  if (typeof err === "string") return new Error(err);
  if (err && typeof err === "object" && "message" in err)
    return new Error(String((err).message));
  return new Error(String(err));
}

export function errorCode(err: unknown): number | string | undefined {
  if (err && typeof err === "object" && "code" in err)
    return (err as { code?: number | string }).code;
  return undefined;
}

export function logError(context: string, err: unknown): void {
  container.logger.error(`[${context}]`, errorFrom(err));
}

/**
 * Drop-in replacement for `.catch(() => null)` that emits a debug-level log
 * so unexpected failures are visible without crashing the caller.
 *
 * Usage: `somePromise.catch(swallow("Context: operation failed"))`
 */
export function swallow(reason: string): (err: unknown) => null {
  return (err: unknown) => {
    container.logger.debug(`[swallow] ${reason}:`, errorFrom(err).message);
    return null;
  };
}
