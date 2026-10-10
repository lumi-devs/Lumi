import { describe, it, expect } from "bun:test";
import {
  cleanMention,
  fmtId,
  isSnowflakeId,
} from "../../../src/lib/utilities/snowflakes.js";

describe("snowflakes", () => {
  it("fmtId converts id to string or returns 'unknown'", () => {
    expect(fmtId("12345")).toBe("12345");
    expect(fmtId(999)).toBe("999");
    expect(fmtId(null)).toBe("unknown");
    expect(fmtId(undefined)).toBe("unknown");
  });

  it("isSnowflakeId accepts 17-20 digit strings", () => {
    expect(isSnowflakeId("123456789012345678")).toBe(true);
    expect(isSnowflakeId("123")).toBe(false);
    expect(isSnowflakeId(12345)).toBe(false);
    expect(isSnowflakeId(null)).toBe(false);
  });

  it("cleanMention strips mention wrapping", () => {
    expect(cleanMention("<@123456789>")).toBe("123456789");
    expect(cleanMention("<#123456789>")).toBe("123456789");
  });
});
