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
    const result = ModuleStateChangedEventSchema.run({
      type: "module.stateChanged",
      v: 1,
      guildId,
      moduleName: "afk",
      enabled: true,
      actorId,
      at: Date.now(),
    });
    expect(result.isOk()).toBe(true);
  });

  it("rejects a non-snowflake guildId", () => {
    const result = ModuleStateChangedEventSchema.run({
      type: "module.stateChanged",
      v: 1,
      guildId: "not-a-snowflake",
      moduleName: "afk",
      enabled: true,
      actorId,
      at: Date.now(),
    });
    expect(result.isErr()).toBe(true);
  });

  it("rejects a version other than 1", () => {
    const result = ModuleStateChangedEventSchema.run({
      type: "module.stateChanged",
      v: 2,
      guildId,
      moduleName: "afk",
      enabled: true,
      actorId,
      at: Date.now(),
    });
    expect(result.isErr()).toBe(true);
  });
});

describe("ConfigChangedEventSchema", () => {
  it("accepts a well-formed event", () => {
    const result = ConfigChangedEventSchema.run({
      type: "config.changed",
      v: 1,
      guildId,
      moduleName: "afk",
      key: "prefix",
      actorId,
      at: Date.now(),
    });
    expect(result.isOk()).toBe(true);
  });

  it("rejects a missing key", () => {
    const result = ConfigChangedEventSchema.run({
      type: "config.changed",
      v: 1,
      guildId,
      moduleName: "afk",
      actorId,
      at: Date.now(),
    });
    expect(result.isErr()).toBe(true);
  });
});

describe("DashboardEventSchema", () => {
  it("accepts either variant", () => {
    expect(
      DashboardEventSchema.run({
        type: "module.stateChanged",
        v: 1,
        guildId,
        moduleName: "afk",
        enabled: false,
        actorId,
        at: 1,
      }).isOk(),
    ).toBe(true);
    expect(
      DashboardEventSchema.run({
        type: "config.changed",
        v: 1,
        guildId,
        moduleName: "afk",
        key: "prefix",
        actorId,
        at: 1,
      }).isOk(),
    ).toBe(true);
  });

  it("rejects an unknown event type", () => {
    const result = DashboardEventSchema.run({
      type: "something.else",
      v: 1,
      guildId,
      actorId,
      at: 1,
    });
    expect(result.isErr()).toBe(true);
  });
});
