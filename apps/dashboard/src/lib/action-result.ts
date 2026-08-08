import { unstable_rethrow } from "next/navigation";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

export async function runAction<T>(
  task: () => Promise<T>,
): Promise<T | { ok: false; error: string }> {
  try {
    return await task();
  } catch (err) {
    // `redirect()`/`notFound()` signal control flow by throwing; swallowing them
    // would surface "NEXT_REDIRECT" as an error instead of redirecting.
    unstable_rethrow(err);
    return { ok: false, error: err instanceof Error ? err.message : "RPC failed" };
  }
}
