import { describe, it, expect, vi, beforeEach } from "bun:test";
import { container } from "#src/lib/Services.js";
import { stickyIndex } from "#src/modules/sticky/data/StickyIndex.js";

describe("stickyIndex", () => {
  let onResyncHandlers: Array<() => void>;

  beforeEach(() => {
    onResyncHandlers = [];
    (container as any).invalidation = {
      onResync: vi.fn((fn: () => void) => {
        onResyncHandlers.push(fn);
        return () => {};
      }),
    };
  });

  it("caches the built index per entries-array reference, and onResync clears it", () => {
    const entries: unknown[] = [
      { channel_id: "channel-1", message: "hello", enabled: true },
    ];

    const first = stickyIndex.find("guild-index", "channel-1", entries);
    expect(first?.message).toBe("hello");

    entries[0] = { channel_id: "channel-1", message: "changed", enabled: true };
    const cached = stickyIndex.find("guild-index", "channel-1", entries);
    expect(cached?.message).toBe("hello");

    for (const handler of onResyncHandlers) handler();

    const rebuilt = stickyIndex.find("guild-index", "channel-1", entries);
    expect(rebuilt?.message).toBe("changed");
  });
});
