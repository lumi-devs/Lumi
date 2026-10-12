import { container } from "#src/lib/Services.js";
import { errorFrom, swallow as swallowWith } from "#src/shared/Index.ts";

export { errorFrom };

export function errorCode(err: unknown): number | string | undefined {
  if (err && typeof err === "object" && "code" in err)
    return (err as { code?: number | string }).code;
  return undefined;
}

export function logError(context: string, err: unknown): void {
  container.logger.error(`[${context}]`, errorFrom(err));
}

export function swallow(reason: string): (err: unknown) => null {
  return swallowWith(reason, (r, e) => container.logger.debug(`[swallow] ${r}:`, e.message));
}
