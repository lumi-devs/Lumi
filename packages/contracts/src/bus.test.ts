import { describe, it, expect } from "vitest";
// @ts-expect-error - BusEventEnvelope was removed
import type { BusEventEnvelope } from "./bus.js";
import type { BusEventMessage } from "./bus.js";

describe("BusEventMessage", () => {
  it("models the actual flat wire shape RabbitClient#publishEvent produces", () => {
    const wire: BusEventMessage<{ guildId: string; moduleName: string }> = {
      event: "module.updated",
      ts: Date.now(),
      traceparent: "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01",
      guildId: "123",
      moduleName: "afk",
    };

    expect(wire.event).toBe("module.updated");
    expect(wire.guildId).toBe("123");
    expect(wire.moduleName).toBe("afk");
    expect((wire as unknown as Record<string, unknown>)["payload"]).toBeUndefined();
  });

  it("is generic over its payload, so a consumer gets typed fields instead of `unknown`", () => {
    function readGuildId(msg: BusEventMessage<{ guildId: string }>): string {
      return msg.guildId;
    }

    expect(readGuildId({ event: "e", ts: 1, guildId: "g-1" })).toBe("g-1");
  });

  it("still permits the payload-free default for events with no extra fields", () => {
    const heartbeat: BusEventMessage = { event: "heartbeat", ts: 1 };
    expect(heartbeat.event).toBe("heartbeat");
  });
});
