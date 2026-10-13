import { sleep } from "@sapphire/utilities";

export class TimeoutError extends Error {
  public constructor(ms: number) {
    super(`Timed out after ${ms}ms`);
    this.name = "TimeoutError";
  }
}

export async function withTimeout<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  ms: number,
): Promise<T> {
  const controller = new AbortController();
  const timer = new AbortController();
  const deadline = sleep(ms, undefined, { signal: timer.signal }).then<never>(
    () => {
      const reason = new TimeoutError(ms);
      queueMicrotask(() => controller.abort(reason));
      throw reason;
    },
  );
  let task: Promise<T>;
  try {
    task = fn(controller.signal);
  } catch (err) {
    timer.abort();
    await deadline.catch(() => undefined);
    throw err;
  }
  try {
    return await Promise.race([task, deadline]);
  } finally {
    timer.abort();
  }
}
