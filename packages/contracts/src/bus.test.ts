import { describe, it, expect } from "vitest";
// @ts-expect-error - BusEventEnvelope described a nested `{ payload: T }`
// shape that never matched the wire (RabbitClient#publishEvent spreads the
// payload flat), and nothing imported it. It was deleted rather than fixed
// in place so nobody accidentally builds a producer/consumer against the
// wrong shape. If this import ever resolves again, the trap is back - this
// directive itself becomes a compile error ("unused '@ts-expect-error'
// directive") the moment that happens, which is the point.
import type { BusEventEnvelope } from "./bus.js";
import type { BusEventMessage } from "./bus.js";

describe("BusEventMessage", () => {
  it("models the actual flat wire shape RabbitClient#publishEvent produces", () => {
    // Mirrors the object literal packages/core/src/lib/rabbitmq/index.ts's
    // publishEvent() actually JSON.stringifies onto the "lumi.events"
    // exchange: envelope fields flat alongside the spread payload fields -
    // never nested under a `payload` property.
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
    // No nested payload container - the fields above ARE the top level.
    expect((wire as unknown as Record<string, unknown>)["payload"]).toBeUndefined();
  });

  it("is generic over its payload, so a consumer gets typed fields instead of `unknown`", () => {
    // Before BusEventMessage took a type parameter, this function signature
    // couldn't even be written: `BusEventMessage<{ guildId: string }>` was a
    // compile error ("Type 'BusEventMessage' is not generic") because the old
    // type was a fixed `{ ... } & Record<string, unknown>` alias. Every field
    // beyond the four envelope ones came back as `unknown`, so producers and
    // consumers each had to re-cast/re-declare the payload shape by hand.
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
