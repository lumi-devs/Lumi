import type { DoctorCheckResult } from "@lumi/lib/doctor/types.js";

/**
 * Races `promise` against a timer that resolves to a synthetic result instead
 * of rejecting - a check that hangs (a dead Postgres/Valkey connection, an
 * unreachable Discord API) must still produce a result for the report rather
 * than stalling `runDoctor()` past its own global timeout.
 */
async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  onTimeout: () => T,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(onTimeout()), ms);
    timer.unref?.();
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function fail(name: string, detail: string): DoctorCheckResult {
  return { name, status: "fail", detail };
}

/**
 * Wraps a single check body so it can never throw or hang past `timeoutMs` -
 * every doctor check goes through this, so `runDoctor()` can run the full set
 * concurrently without one bad dependency (a thrown error, a socket that
 * never resolves) taking the whole report down with it.
 */
export function runCheck(
  name: string,
  timeoutMs: number,
  body: () => Promise<DoctorCheckResult>,
): Promise<DoctorCheckResult> {
  const attempt = Promise.resolve()
    .then(body)
    .catch((err) =>
      fail(name, `threw: ${err instanceof Error ? err.message : String(err)}`),
    );
  return withTimeout(attempt, timeoutMs, () => fail(name, "timed out"));
}
