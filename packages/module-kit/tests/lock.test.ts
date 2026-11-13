import { describe, expect, it } from "vitest";
import { tryKeyLock, withKeyLock } from "../src/lock.js";
import type { ModuleServices } from "../src/types.js";

type LockCache = ModuleServices["helpers"]["cache"];

function services(
  distributed: boolean,
  takeLock: LockCache["takeLock"] = async () => null,
): ModuleServices {
  return {
    helpers: { cache: { distributed, takeLock } },
  } as unknown as ModuleServices;
}

describe("withKeyLock", () => {
  it("serializes local work for the same key", async () => {
    const local = services(false);
    const order: string[] = [];
    const { promise: gate, resolve: releaseFirst } =
      Promise.withResolvers<void>();

    const first = withKeyLock(local, "k", async () => {
      order.push("first:start");
      await gate;
      order.push("first:end");
    });
    const second = withKeyLock(local, "k", async () => {
      order.push("second");
    });

    releaseFirst();
    await Promise.all([first, second]);
    expect(order).toEqual(["first:start", "first:end", "second"]);
  });

  it("does not let a failed task stall the local chain", async () => {
    const local = services(false);
    const failed = withKeyLock(local, "k", async () => {
      throw new Error("boom");
    });
    const next = withKeyLock(local, "k", async () => "ok");

    await expect(failed).rejects.toThrow("boom");
    await expect(next).resolves.toBe("ok");
  });

  it("retries distributed acquisition until a release is granted", async () => {
    let attempts = 0;
    let released = false;
    const distributed = services(true, async () => {
      attempts += 1;
      if (attempts < 3) return null;
      return async () => {
        released = true;
      };
    });

    await expect(
      withKeyLock(distributed, "k", async () => "done", { pollMs: 1 }),
    ).resolves.toBe("done");
    expect(attempts).toBe(3);
    expect(released).toBe(true);
  });
});

describe("tryKeyLock", () => {
  it("returns a local release that frees the key", async () => {
    const local = services(false);
    const release = await tryKeyLock(local, "k", 1_000);
    expect(release).not.toBeNull();
    await release?.();

    await expect(
      withKeyLock(local, "k", async () => "after"),
    ).resolves.toBe("after");
  });

  it("returns null on a single failed distributed attempt", async () => {
    let attempts = 0;
    const distributed = services(true, async () => {
      attempts += 1;
      return null;
    });

    await expect(tryKeyLock(distributed, "k", 1_000)).resolves.toBeNull();
    expect(attempts).toBe(1);
  });
});
