import { describe, it, expect, vi, beforeEach } from "bun:test";
import { container } from "#lib/services.js";
import { publishDashboardEvent } from "#lib/rpc/dashboard-events.js";
import { DashboardEventStream } from "@lumi/contracts/events";
import { dashboardEventPublishFailures } from "@lumi/observability";

describe("publishDashboardEvent", () => {
  beforeEach(() => {
    container.logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as any;
    dashboardEventPublishFailures.reset();
  });

  it("publishes onto the shared dashboard event stream, stamped with the schema version", async () => {
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
    await publishDashboardEvent(container, event);

    expect(publish).toHaveBeenCalledWith(DashboardEventStream, { ...event, v: 1 });
  });

  it("swallows publish errors instead of throwing, and counts the failure", async () => {
    (container as any).eventBus = {
      publish: vi.fn().mockRejectedValue(new Error("valkey down")),
    };

    await expect(
      publishDashboardEvent(container, {
        type: "config.changed",
        guildId: "111111111111111111",
        moduleName: "afk",
        key: "prefix",
        actorId: "222222222222222222",
        at: 1,
      }),
    ).resolves.toBeUndefined();
    expect(container.logger.warn).toHaveBeenCalled();
    expect((await dashboardEventPublishFailures.get()).values).toContainEqual(
      expect.objectContaining({ labels: { reason: "publish_failed" }, value: 1 }),
    );
  });

  it("no-ops when the event bus isn't installed (most RPC unit tests)", async () => {
    (container as any).eventBus = undefined;

    await expect(
      publishDashboardEvent(container, {
        type: "config.changed",
        guildId: "111111111111111111",
        moduleName: "afk",
        key: "prefix",
        actorId: "222222222222222222",
        at: 1,
      }),
    ).resolves.toBeUndefined();
  });

  it("drops a malformed event without publishing, and counts it as invalid", async () => {
    const publish = vi.fn().mockResolvedValue("1-0");
    (container as any).eventBus = { publish };

    await expect(
      publishDashboardEvent(container, {
        type: "module.stateChanged",
        guildId: "not-a-snowflake",
        moduleName: "afk",
        enabled: true,
        actorId: "222222222222222222",
        at: 123,
      } as any),
    ).resolves.toBeUndefined();

    expect(publish).not.toHaveBeenCalled();
    expect(container.logger.warn).toHaveBeenCalled();
    expect((await dashboardEventPublishFailures.get()).values).toContainEqual(
      expect.objectContaining({ labels: { reason: "invalid" }, value: 1 }),
    );
  });
});
