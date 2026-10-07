import { describe, expect, it } from "bun:test";
import {
  ConfigChangedEventSchema,
  DashboardEventSchema,
  ModuleStateChangedEventSchema,
} from "./events.js";

const guildId = "111111111111111111";
const actorId = "222222222222222222";

describe("ModuleStateChangedEventSchema", () => {
  it("accepts a well-formed event", () => {
    const result = ModuleStateChangedEventSchema.safeParse({
      type: "module.stateChanged",
      v: 1,
      guildId,
      moduleName: "afk",
      enabled: true,
      actorId,
      at: Date.now(),
    });
    expect(result.success).toBe(true);
  });

  it("rejects a non-snowflake guildId", () => {
    const result = ModuleStateChangedEventSchema.safeParse({
      type: "module.stateChanged",
      v: 1,
      guildId: "not-a-snowflake",
      moduleName: "afk",
      enabled: true,
      actorId,
      at: Date.now(),
    });
    expect(result.success).toBe(false);
  });

  it("rejects a version other than 1", () => {
    const result = ModuleStateChangedEventSchema.safeParse({
      type: "module.stateChanged",
      v: 2,
      guildId,
      moduleName: "afk",
      enabled: true,
      actorId,
      at: Date.now(),
    });
    expect(result.success).toBe(false);
  });
});

describe("ConfigChangedEventSchema", () => {
  it("accepts a well-formed event", () => {
    const result = ConfigChangedEventSchema.safeParse({
      type: "config.changed",
      v: 1,
      guildId,
      moduleName: "afk",
      key: "prefix",
      actorId,
      at: Date.now(),
    });
    expect(result.success).toBe(true);
  });

  it("rejects a missing key", () => {
    const result = ConfigChangedEventSchema.safeParse({
      type: "config.changed",
      v: 1,
      guildId,
      moduleName: "afk",
      actorId,
      at: Date.now(),
    });
    expect(result.success).toBe(false);
  });
});

describe("DashboardEventSchema", () => {
  it("accepts either variant", () => {
    expect(
      DashboardEventSchema.safeParse({
        type: "module.stateChanged",
        v: 1,
        guildId,
        moduleName: "afk",
        enabled: false,
        actorId,
        at: 1,
      }).success,
    ).toBe(true);
    expect(
      DashboardEventSchema.safeParse({
        type: "config.changed",
        v: 1,
        guildId,
        moduleName: "afk",
        key: "prefix",
        actorId,
        at: 1,
      }).success,
    ).toBe(true);
  });

  it("rejects an unknown event type", () => {
    const result = DashboardEventSchema.safeParse({
      type: "something.else",
      v: 1,
      guildId,
      actorId,
      at: 1,
    });
    expect(result.success).toBe(false);
  });
});
