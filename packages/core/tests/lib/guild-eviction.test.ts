import { describe, expect, test, vi } from "bun:test";
import { evictGuildValkeyState } from "#lib/database/guild-eviction.js";

function mocks() {
  const scanned: string[] = [];
  const valkey = {
    scan: vi.fn((cursor: string, ..._rest: unknown[]) => {
      void cursor;
      return Promise.resolve(["0", []] as [string, string[]]);
    }),
  };
  const invalidated: string[][] = [];
  const invalidation = {
    invalidate: vi.fn((...keys: string[]) => {
      invalidated.push(keys);
      return Promise.resolve();
    }),
  };
  const logger = { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() };
  return { valkey, invalidation, logger, scanned, invalidated };
}

describe("evictGuildValkeyState", () => {
  test("evicts static keys and builder-derived patterns for the guild", async () => {
    const { valkey, invalidation, logger, invalidated } = mocks();

    await evictGuildValkeyState(valkey as any, invalidation as any, logger as any, "g1", "test");

    // Static keys go through invalidation.
    const all = invalidated.flat();
    expect(all).toContain("lumi:settings:guild:g1");
    expect(all).toContain("lumi:ignore:guild:g1");
    expect(all).toContain("lumi:rest:guild:g1");
    expect(all).toContain("lumi:rest:guild:g1:roles");

    // SCAN ran over builder-derived patterns covering every guild key family.
    const patterns = valkey.scan.mock.calls.map((c) => String(c[2]));
    expect(patterns).toContain("lumi:cfg:*:guild:g1");
    expect(patterns).toContain("lumi:module:enabled:*:g1");
    expect(patterns).toContain("lumi:kv:g1:*:*:*");
    expect(patterns).toContain("lumi:permits:g1:*");
    expect(patterns).toContain("lumi:block:g1:*");
    expect(patterns).toContain("lumi:rest:member:g1:*");
    expect(patterns).toContain("lumi:rest:guild:g1:members:*");
    expect(patterns).toContain("lumi:ignore:channel:g1:*");
    expect(patterns).toContain("lumi:mod:g1:quarantine:*");
    expect(patterns).toContain("lumi:security:g1:window:*:*");
    expect(patterns).toContain("lumi:filter:g1:heat:*");
    expect(patterns).toContain("lumi:logging:g1:claim:*");
    expect(patterns).toContain("lumi:perms:*:g1");
    expect(patterns).toContain("lumi:flags:override:*:g1");
    expect(patterns).toContain("lumi:rpc:idem:*:g1:*");
    // Module-local key shapes outside ValkeyKeys.
    expect(patterns).toContain("lumi:sticky:g1:*");
    expect(patterns).toContain("lumi:afk:g1:*");
  });

  test("SCAN uses a raised COUNT hint to cut round trips per pattern", async () => {
    const { valkey, invalidation, logger } = mocks();

    await evictGuildValkeyState(valkey as any, invalidation as any, logger as any, "g1", "test");

    for (const call of valkey.scan.mock.calls) {
      expect(call).toContain("COUNT");
      expect(call[call.indexOf("COUNT") + 1]).toBe(500);
    }
  });

  test("a SCAN failure for one pattern does not abort the eviction", async () => {
    const { valkey, invalidation, logger, invalidated } = mocks();
    valkey.scan.mockRejectedValueOnce(new Error("down"));

    await evictGuildValkeyState(valkey as any, invalidation as any, logger as any, "g1", "test");

    expect(logger.warn).toHaveBeenCalled();
    expect(invalidated.flat()).toContain("lumi:settings:guild:g1");
  });
});
