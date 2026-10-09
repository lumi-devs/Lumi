import { vi } from "bun:test";

/**
 * Minimal in-memory stand-in for the subset of iovalkey's API `withIdempotency`
 * (and anything else doing a plain SET NX / GET / DEL) needs. No TTL
 * expiry - tests that care about expiry assert against the stored value
 * directly rather than waiting on a timer.
 */
export function createMemoryValkey() {
  const store = new Map<string, string>();
  return {
    get: vi.fn(async (key: string) => (store.has(key) ? (store.get(key) as string) : null)),
    set: vi.fn(async (key: string, value: string, ...args: unknown[]) => {
      if (args.includes("NX") && store.has(key)) return null;
      store.set(key, value);
      return "OK";
    }),
    del: vi.fn(async (key: string) => (store.delete(key) ? 1 : 0)),
    pexpire: vi.fn(async (key: string, _ms: number) => (store.has(key) ? 1 : 0)),
    setex: vi.fn(async (key: string, _ttl: number, value: string) => {
      store.set(key, value);
      return "OK";
    }),
    exists: vi.fn(async (key: string) => (store.has(key) ? 1 : 0)),
    $store: store,
  };
}
