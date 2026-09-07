/**
 * `setupFiles` entry: vitest fork workers lack the Bun global, so provide
 * throwing stubs for `vi.spyOn(Bun, ...)` to attach to. Every suite using
 * them overrides the implementation.
 */
const existing = (globalThis as { Bun?: unknown }).Bun as
  | Record<string, unknown>
  | undefined;

(globalThis as { Bun?: unknown }).Bun ??= {
  ...existing,
  spawn: () => {
    throw new Error("Bun.spawn stub reached without a mock - spyOn it in the test");
  },
  sleep: (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),
};
