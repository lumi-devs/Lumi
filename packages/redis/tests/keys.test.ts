import { describe, expect, test } from "bun:test";
import { createKeys } from "../src/index.ts";

describe("keys", () => {
  test("module data keys are unambiguous", () => {
    const keys = createKeys("lumi");
    expect(keys.moduleData("g", "m", "t", "k")).toBe("lumi:kv:g:m:1:t:k");
    expect(keys.moduleData("g", "m", "", "a:b")).not.toBe(keys.moduleData("g", "m", "a", "b"));
  });
});
