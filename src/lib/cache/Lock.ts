interface LockEntry {
  token: string;
  expiresAt: number;
}

const activeLocks = new Map<string, LockEntry>();

export interface Lock {
  token: string;
  release(): void;
}

export async function acquireLock(
  key: string,
  options: { ttlMs?: number; acquireTimeoutMs?: number } = {},
): Promise<Lock> {
  const ttlMs = options.ttlMs ?? 15_000;
  const timeoutMs = options.acquireTimeoutMs ?? 5_000;
  const deadline = Date.now() + timeoutMs;
  const token = Math.random().toString(36).slice(2);

  while (Date.now() < deadline) {
    const existing = activeLocks.get(key);
    if (!existing || Date.now() >= existing.expiresAt) {
      activeLocks.set(key, { token, expiresAt: Date.now() + ttlMs });
      return {
        token,
        release: () => {
          const cur = activeLocks.get(key);
          if (cur?.token === token) {
            activeLocks.delete(key);
          }
        },
      };
    }
    await new Promise((r) => setTimeout(r, 25));
  }

  throw new Error(`Timeout acquiring lock: ${key}`);
}

export function isLockHeld(key: string): boolean {
  const existing = activeLocks.get(key);
  if (!existing) return false;
  if (Date.now() >= existing.expiresAt) {
    activeLocks.delete(key);
    return false;
  }
  return true;
}
