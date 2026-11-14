import { vi } from "bun:test";

export interface MemoryRedis {
  get: ReturnType<typeof vi.fn>;
  mget: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  setex: ReturnType<typeof vi.fn>;
  getset: ReturnType<typeof vi.fn>;
  del: ReturnType<typeof vi.fn>;
  exists: ReturnType<typeof vi.fn>;
  pexpire: ReturnType<typeof vi.fn>;
  expire: ReturnType<typeof vi.fn>;
  pttl: ReturnType<typeof vi.fn>;
  ttl: ReturnType<typeof vi.fn>;
  incr: ReturnType<typeof vi.fn>;
  hincrby: ReturnType<typeof vi.fn>;
  hget: ReturnType<typeof vi.fn>;
  hset: ReturnType<typeof vi.fn>;
  hgetall: ReturnType<typeof vi.fn>;
  lpush: ReturnType<typeof vi.fn>;
  lrange: ReturnType<typeof vi.fn>;
  keys: ReturnType<typeof vi.fn>;
  scan: ReturnType<typeof vi.fn>;
  eval: ReturnType<typeof vi.fn>;
  publish: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
  psubscribe: ReturnType<typeof vi.fn>;
  duplicate: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  removeListener: ReturnType<typeof vi.fn>;
  pipeline: ReturnType<typeof vi.fn>;
  multi: ReturnType<typeof vi.fn>;
  quit: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  $store: Map<string, string>;
}

export function createMemoryRedis(): MemoryRedis {
  const store = new Map<string, string>();
  const expiries = new Map<string, number>();

  const alive = (key: string): boolean => {
    const at = expiries.get(key);
    if (at !== undefined && at <= Date.now()) {
      store.delete(key);
      expiries.delete(key);
      return false;
    }
    return store.has(key);
  };
  const read = (key: string): string | null => (alive(key) ? (store.get(key) as string) : null);

  const client: MemoryRedis = {
    get: vi.fn(async (key: string) => read(key)),
    mget: vi.fn(async (...keys: string[]) => keys.map((key) => read(key))) as any,
    set: vi.fn(async (key: string, value: string, ...args: unknown[]) => {
      if (args.includes("NX") && alive(key)) return null;
      store.set(key, String(value));
      const px = args.indexOf("PX");
      const ex = args.indexOf("EX");
      if (px !== -1) expiries.set(key, Date.now() + Number(args[px + 1]));
      else if (ex !== -1) expiries.set(key, Date.now() + Number(args[ex + 1]) * 1000);
      return "OK";
    }),
    setex: vi.fn(async (key: string, ttlSeconds: number, value: string) => {
      store.set(key, String(value));
      if (ttlSeconds > 0) expiries.set(key, Date.now() + ttlSeconds * 1000);
      return "OK";
    }),
    getset: vi.fn(async (key: string, value: string) => {
      const prev = read(key);
      store.set(key, String(value));
      return prev;
    }),
    del: vi.fn(async (...keys: string[]) => {
      let removed = 0;
      for (const key of keys) {
        if (store.delete(key)) removed++;
        expiries.delete(key);
      }
      return removed;
    }),
    exists: vi.fn(async (...keys: string[]) => keys.filter((key) => alive(key)).length),
    pexpire: vi.fn(async (key: string, ms: number) => {
      if (!alive(key)) return 0;
      expiries.set(key, Date.now() + Number(ms));
      return 1;
    }),
    expire: vi.fn(async (key: string, seconds: number) => {
      if (!alive(key)) return 0;
      expiries.set(key, Date.now() + Number(seconds) * 1000);
      return 1;
    }),
    pttl: vi.fn(async (key: string) => {
      if (!alive(key)) return -2;
      const at = expiries.get(key);
      return at === undefined ? -1 : at - Date.now();
    }),
    ttl: vi.fn(async (key: string) => {
      if (!alive(key)) return -2;
      const at = expiries.get(key);
      return at === undefined ? -1 : Math.ceil((at - Date.now()) / 1000);
    }),
    incr: vi.fn(async (key: string) => {
      const next = Number(read(key) ?? "0") + 1;
      store.set(key, String(next));
      return next;
    }),
    hincrby: vi.fn(async (key: string, field: string, by: number) => {
      const hash = hashOf(store, key);
      const next = Number(hash[field] ?? "0") + Number(by);
      hash[field] = String(next);
      store.set(key, JSON.stringify(hash));
      return next;
    }),
    hget: vi.fn(async (key: string, field: string) => hashOf(store, key)[field] ?? null),
    hset: vi.fn(async (key: string, field: string, value: string) => {
      const hash = hashOf(store, key);
      hash[field] = String(value);
      store.set(key, JSON.stringify(hash));
      return 1;
    }),
    hgetall: vi.fn(async (key: string) => hashOf(store, key)),
    lpush: vi.fn(async (key: string, ...values: string[]) => {
      const list = listOf(store, key);
      list.unshift(...values.map(String));
      store.set(key, JSON.stringify(list));
      return list.length;
    }),
    lrange: vi.fn(async (key: string, start: number, stop: number) => {
      const list = listOf(store, key);
      const end = stop < 0 ? list.length + stop + 1 : stop + 1;
      return list.slice(start, end);
    }),
    keys: vi.fn(async (pattern: string) => {
      const rx = new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`);
      return [...store.keys()].filter((key) => alive(key) && rx.test(key));
    }),
    scan: vi.fn(async (_cursor: string, _match: string, pattern: string) => [
      "0",
      [...store.keys()].filter((key) => alive(key) && matchPattern(pattern, key)),
    ]),
    eval: vi.fn(async () => null),
    publish: vi.fn(async () => 0),
    subscribe: vi.fn(async () => undefined),
    psubscribe: vi.fn(async () => undefined),
    duplicate: vi.fn(() => client),
    on: vi.fn(() => client),
    removeListener: vi.fn(() => client),
    pipeline: vi.fn(() => pipeline(store)),
    multi: vi.fn(() => pipeline(store)),
    quit: vi.fn(async () => "OK"),
    disconnect: vi.fn(() => undefined),
    $store: store,
  };

  return client;
}

function hashOf(store: Map<string, string>, key: string): Record<string, string> {
  const raw = store.get(key);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function listOf(store: Map<string, string>, key: string): string[] {
  const raw = store.get(key);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function matchPattern(pattern: string, value: string): boolean {
  const rx = new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`);
  return rx.test(value);
}

function pipeline(store: Map<string, string>) {
  const queue: Array<() => unknown> = [];
  const builder = {
    get: (key: string) => {
      queue.push(() => store.get(key) ?? null);
      return builder;
    },
    set: (key: string, value: string) => {
      queue.push(() => {
        store.set(key, String(value));
        return "OK";
      });
      return builder;
    },
    setex: (key: string, _ttl: number, value: string) => {
      queue.push(() => {
        store.set(key, String(value));
        return "OK";
      });
      return builder;
    },
    del: (key: string) => {
      queue.push(() => (store.delete(key) ? 1 : 0));
      return builder;
    },
    exec: async () => queue.map((run) => [null, run()]),
  };
  return builder;
}

export const memoryRedis = createMemoryRedis();
