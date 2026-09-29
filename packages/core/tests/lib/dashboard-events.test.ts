import { describe, it, expect, vi, beforeEach } from "bun:test";
import { container } from "@sapphire/framework";
import { publishDashboardEvent } from "#lib/rpc/dashboard-events.js";
import { DashboardEventStream } from "@lumi/contracts/events";

describe("publishDashboardEvent", () => {
  beforeEach(() => {
    container.logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as any;
  });

  it("publishes onto the shared dashboard event stream", async () => {
    const publish = vi.fn().mockResolvedValue("1-0");
    (container as any).eventBus = { publish };

    const event = {
      type: "module.stateChanged" as const,
      guildId: "111111111111111111",
      moduleName: "afk",
      enabled: true,
      actorId: "222222222222222222",
      at: 123,
    };
    await publishDashboardEvent(event);

    expect(publish).toHaveBeenCalledWith(DashboardEventStream, event);
  });

  it("swallows publish errors instead of throwing", async () => {
    (container as any).eventBus = {
      publish: vi.fn().mockRejectedValue(new Error("redis down")),
    };

    await expect(
      publishDashboardEvent({
        type: "config.changed",
        guildId: "111111111111111111",
        moduleName: "afk",
        key: "prefix",
        actorId: "222222222222222222",
        at: 1,
      }),
    ).resolves.toBeUndefined();
    expect(container.logger.warn).toHaveBeenCalled();
  });

  it("no-ops when the event bus isn't installed (most RPC unit tests)", async () => {
    (container as any).eventBus = undefined;

    await expect(
      publishDashboardEvent({
        type: "config.changed",
        guildId: "111111111111111111",
        moduleName: "afk",
        key: "prefix",
        actorId: "222222222222222222",
        at: 1,
      }),
    ).resolves.toBeUndefined();
  });
});
