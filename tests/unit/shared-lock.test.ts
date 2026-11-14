import type { ModuleServices } from "@lumi/module-kit";
import { describe, expect, it, vi } from "vitest";
import { tryWithLock } from "../../modules/shared/lock.js";

function servicesWithCache(
  cache: Partial<ModuleServices["helpers"]["cache"]>,
): ModuleServices {
  return {
    helpers: { cache: { distributed: false, ...cache } },
    observability: { logger: { warn: vi.fn() } },
  } as unknown as ModuleServices;
}

describe("tryWithLock", () => {
  it("rejects a concurrent local operation", async () => {
    const services = servicesWithCache({});
    let release: (() => void) | undefined;
    const first = tryWithLock(services, "local-key", 1_000, async () => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return "first";
    });

    const second = await tryWithLock(
      services,
      "local-key",
      1_000,
      async () => "second",
    );

    expect(second).toEqual({ ok: false, reason: "busy" });
    release?.();
    await expect(first).resolves.toEqual({ ok: true, value: "first" });
  });

  it("retries a distributed lock until it becomes available", async () => {
    let attempts = 0;
    const services = servicesWithCache({
      distributed: true,
      takeLock: vi.fn(async () => {
        attempts += 1;
        return attempts === 1 ? null : async () => undefined;
      }),
    });

    const result = await tryWithLock(
      services,
      "redis-key",
      1_000,
      async () => 42,
      100,
    );

    expect(result).toEqual({ ok: true, value: 42 });
    expect(attempts).toBe(2);
  });

  it("releases the local lock when Redis is unavailable", async () => {
    const services = servicesWithCache({
      distributed: true,
      takeLock: vi.fn(async () => {
        throw new Error("redis down");
      }),
    });

    await expect(
      tryWithLock(services, "redis-key", 1_000, async () => "never"),
    ).resolves.toEqual({ ok: false, reason: "unavailable" });

    const recovered = servicesWithCache({});
    await expect(
      tryWithLock(recovered, "redis-key", 1_000, async () => "ok"),
    ).resolves.toEqual({ ok: true, value: "ok" });
  });
});
