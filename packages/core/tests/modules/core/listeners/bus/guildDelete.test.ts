import { describe, it, expect, vi, beforeEach } from "bun:test";
import { guildDeleteEventBusListener } from "#modules/core/listeners/bus/guildDelete.js";
import { tryGetUtility } from "#lib/module-system/Utility.js";

vi.mock("#lib/module-system/Utility.js", () => ({
  tryGetUtility: vi.fn(),
}));

function makeServices() {
  const mockFilterUtility = { evict: vi.fn() };
  (tryGetUtility as any).mockImplementation((name: string) =>
    name === "filter" ? mockFilterUtility : undefined,
  );
  const services = {
    db: { markGuildLeft: vi.fn().mockResolvedValue(undefined) },
    valkey: { scan: vi.fn().mockResolvedValue(["0", []]) },
    invalidation: { invalidate: vi.fn().mockResolvedValue(undefined) },
    logger: { warn: vi.fn(), error: vi.fn(), debug: vi.fn(), info: vi.fn() },
  } as any;
  return { services, mockFilterUtility };
}

describe("guildDeleteEventBusListener", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("marks the guild left and evicts its Valkey state when it is a real departure", async () => {
    const { services, mockFilterUtility } = makeServices();
    const guild = { id: "g1", available: true } as any;

    await guildDeleteEventBusListener.execute(services, guild);

    expect(services.db.markGuildLeft).toHaveBeenCalledWith("g1");
    expect(mockFilterUtility.evict).toHaveBeenCalledWith("g1");
  });

  it("does nothing when the guild is merely unavailable (a Discord outage, not a real departure)", async () => {
    const { services, mockFilterUtility } = makeServices();
    const guild = { id: "g1", available: false } as any;

    await guildDeleteEventBusListener.execute(services, guild);

    expect(services.db.markGuildLeft).not.toHaveBeenCalled();
    expect(mockFilterUtility.evict).not.toHaveBeenCalled();
  });
});
