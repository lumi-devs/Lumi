/** Standard Server Action result shape: `{ ok: true }` or `{ ok: false, error }`. */
export interface ActionResult {
  ok: boolean;
  error?: string;
}

/**
 * Shared boilerplate for the dashboard's Server Actions (`actions/guild-actions.ts`,
 * `actions/system-actions.ts`): each one does guard → `rpcCall(...)` →
 * optional `revalidatePath(...)` → return `{ ok: true }`, with any thrown
 * error (guard rejection, RPC failure/timeout, ...) normalized to
 * `{ ok: false, error }`. `runAction` captures that try/catch once so each
 * action only has to describe its own guarded work.
 */
export async function runAction<T>(
  task: () => Promise<T>,
): Promise<T | { ok: false; error: string }> {
  try {
    return await task();
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "RPC failed" };
  }
}
