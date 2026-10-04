import { describe, it, expect, vi } from "bun:test";
import {
  OutboxService,
  MemoryOutboxStorage,
} from "../src/database/outbox.js";
import type { LumiDomainEvent } from "@lumi/contracts";

describe("OutboxService & MemoryOutboxStorage", () => {
  const sampleEvent: LumiDomainEvent = {
    eventId: "evt-1",
    type: "GuildSettingsUpdated",
    version: 1,
    timestamp: Date.now(),
    producer: "test",
    tenantId: "guild-123",
    payload: {
      guildId: "guild-123",
      moduleName: "moderation",
      key: "logChannel",
      value: "channel-456",
    },
  };

  it("records domain events into outbox storage as unpublished", async () => {
    const storage = new MemoryOutboxStorage();
    const service = new OutboxService(storage);

    const record = await service.record(sampleEvent);
    expect(record.id).toBeDefined();
    expect(record.eventId).toBe("evt-1");
    expect(record.eventType).toBe("GuildSettingsUpdated");
    expect(record.tenantId).toBe("guild-123");
    expect(record.published).toBe(false);

    const pending = await storage.fetchUnpublished();
    expect(pending).toHaveLength(1);
    expect(pending[0]!.id).toBe(record.id);
  });

  it("dispatches pending messages and marks them published", async () => {
    const storage = new MemoryOutboxStorage();
    const service = new OutboxService(storage);

    await service.record(sampleEvent);
    await service.record({
      ...sampleEvent,
      eventId: "evt-2",
      type: "ModuleEnabled",
      payload: { guildId: "guild-123", moduleName: "afk" },
    });

    const published: string[] = [];
    const count = await service.dispatchPending(async (msg) => {
      published.push(msg.eventId);
    });

    expect(count).toBe(2);
    expect(published).toEqual(["evt-1", "evt-2"]);

    const remaining = await storage.fetchUnpublished();
    expect(remaining).toHaveLength(0);
  });

  it("halts on publisher failure preserving subsequent messages for retry", async () => {
    const storage = new MemoryOutboxStorage();
    const service = new OutboxService(storage);

    await service.record(sampleEvent);
    await service.record({
      ...sampleEvent,
      eventId: "evt-2",
      type: "ModuleDisabled",
      payload: { guildId: "guild-123", moduleName: "welcome" },
    });
    await service.record({
      ...sampleEvent,
      eventId: "evt-3",
      type: "GuildDeleted",
      payload: { guildId: "guild-123" },
    });

    let calls = 0;
    const count = await service.dispatchPending(async (msg) => {
      calls++;
      if (msg.eventId === "evt-2") {
        throw new Error("Redis connection dropped");
      }
    });

    expect(count).toBe(1);
    expect(calls).toBe(2);

    const remaining = await storage.fetchUnpublished();
    expect(remaining).toHaveLength(2);
    expect(remaining[0]!.eventId).toBe("evt-2");
    expect(remaining[1]!.eventId).toBe("evt-3");
  });

  it("returns 0 when there are no pending messages to dispatch", async () => {
    const service = new OutboxService();
    const count = await service.dispatchPending(vi.fn());
    expect(count).toBe(0);
  });
});
