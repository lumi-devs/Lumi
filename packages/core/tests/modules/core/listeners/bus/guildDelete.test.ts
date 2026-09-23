import { describe, it, expect, vi, beforeEach } from "bun:test";
import { GuildDeleteEventBusListener } from "#modules/core/listeners/bus/guildDelete.js";
import { container } from "@sapphire/framework";
import { tryGetUtility } from "#lib/module-system/Utility.js";

vi.mock("#lib/module-system/Utility.js", () => ({
  tryGetUtility: vi.fn(),
}));

describe("GuildDeleteEventBusListener", () => {
  let listener: GuildDeleteEventBusListener;
  let mockDb: any;
  let mockFilterUtility: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockDb = { markGuildLeft: vi.fn().mockResolvedValue(undefined) };
    mockFilterUtility = { evict: vi.fn() };

    (tryGetUtility as any).mockImplementation((name: string) =>
      name === "filter" ? mockFilterUtility : null,
    );

    (container as any).db = mockDb;
    (container as any).redis = {
      scan: vi.fn().mockResolvedValue(["0", []]),
    };
    (container as any).invalidation = {
      invalidate: vi.fn().mockResolvedValue(undefined),
    };
    (container as any).logger = {
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      info: vi.fn(),
    };

    listener = new GuildDeleteEventBusListener(
      {
        name: "guildDelete",
        path: "/path/to/modules/core/listeners/bus/guildDelete.ts",
        root: "/path/to/modules",
        store: { name: "listeners" } as any,
      },
      {},
    );
  });

  it("marks the guild left and evicts its Redis state when it is a real departure", async () => {
    const guild = { id: "g1", available: true } as any;

    await listener.run(guild);

    expect(mockDb.markGuildLeft).toHaveBeenCalledWith("g1");
    expect(mockFilterUtility.evict).toHaveBeenCalledWith("g1");
  });

  it("does nothing when the guild is merely unavailable (a Discord outage, not a real departure)", async () => {
    const guild = { id: "g1", available: false } as any;

    await listener.run(guild);

    expect(mockDb.markGuildLeft).not.toHaveBeenCalled();
    expect(mockFilterUtility.evict).not.toHaveBeenCalled();
  });
});
