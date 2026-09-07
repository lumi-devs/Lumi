/**
 * `Bun.sleep` with a `setTimeout` fallback for runtimes without the Bun
 * global (vitest fork workers). Process spawning falls back in
 * `#lib/utilities/exec-file.js`.
 */
export function sleep(ms: number): Promise<void> {
  const runtime = (globalThis as { Bun?: { sleep?: (ms: number) => Promise<void> } }).Bun;
  if (runtime?.sleep) return runtime.sleep(ms);
  return new Promise((resolve) => setTimeout(resolve, ms));
}
