import { container } from "@lumi/lib/services.js";
import { errorFrom, swallow as swallowWith } from "@lumi/shared";

export { errorFrom };

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
  return swallowWith(reason, (r, e) => container.logger.debug(`[swallow] ${r}:`, e.message));
}
