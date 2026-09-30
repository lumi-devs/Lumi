import { describe, it, expect } from "bun:test";
import { s } from "@sapphire/shapeshift";
import {
  AuditFilterShape,
  boundedArray,
  CursorSchema,
  PageSchema,
  PageSizeSchema,
  SnowflakeSchema,
} from "./schemas.js";

const MaxPageSize = 100;

describe("SnowflakeSchema", () => {
  it.each(["123456789012345678", "12345678901234567", "12345678901234567890"])(
    "accepts %s",
    (value) => {
      expect(SnowflakeSchema.parse(value)).toBe(value);
    },
  );

  it.each([
    ["too short", "1234567890123456"],
    ["too long", "123456789012345678901"],
    ["non-numeric", "not-a-snowflake"],
    ["negative", "-123456789012345678"],
    ["empty", ""],
    ["padded with spaces", " 123456789012345678 "],
    ["decimal", "123456789012345.78"],
    ["mixed alphanumeric", "12345678901234567a"],
  ])("rejects a %s id", (_label, value) => {
    expect(() => SnowflakeSchema.parse(value)).toThrow();
  });

  it("rejects a snowflake that is not a string", () => {
    expect(() => SnowflakeSchema.parse(123456)).toThrow();
    expect(() => SnowflakeSchema.parse(null)).toThrow();
  });
});

describe("PageSchema and PageSizeSchema", () => {
  it("treats an absent page as valid", () => {
    expect(PageSchema.parse(undefined)).toBeUndefined();
    expect(PageSizeSchema.parse(undefined)).toBeUndefined();
  });

  it("accepts the first page", () => {
    expect(PageSchema.parse<number | undefined>(1)).toBe(1);
  });

  it.each([0, -1, 1.5])("rejects page %s", (value) => {
    expect(() => PageSchema.parse(value)).toThrow();
  });

  it("accepts a page size at the cap", () => {
    expect(PageSizeSchema.parse<number | undefined>(MaxPageSize)).toBe(MaxPageSize);
  });

  it("rejects a page size above the cap", () => {
    expect(() => PageSizeSchema.parse(MaxPageSize + 1)).toThrow();
  });

  it.each([0, -5])("rejects page size %s", (value) => {
    expect(() => PageSizeSchema.parse(value)).toThrow();
  });
});

describe("CursorSchema", () => {
  it("treats an absent cursor as valid", () => {
    expect(CursorSchema.parse(undefined)).toBeUndefined();
  });

  it("accepts a non-empty string", () => {
    expect(CursorSchema.parse<string | undefined>("eyJhIjoxfQ")).toBe("eyJhIjoxfQ");
  });

  it("rejects an empty string", () => {
    expect(() => CursorSchema.parse("")).toThrow();
  });

  it("rejects a cursor above the length cap", () => {
    expect(() => CursorSchema.parse("a".repeat(513))).toThrow();
  });

  it("accepts a cursor at the length cap", () => {
    const value = "a".repeat(512);
    expect(CursorSchema.parse<string | undefined>(value)).toBe(value);
  });

  it("rejects a non-string cursor", () => {
    expect(() => CursorSchema.parse(123)).toThrow();
  });
});

describe("AuditFilterShape (cursor-only)", () => {
  const AuditFilter = s.object(AuditFilterShape);

  it("strips an unrecognized page field", () => {
    const payload = { userId: "123456789012345678", page: 2, pageSize: 10 };
    expect(AuditFilter.parse(payload)).toEqual({
      userId: "123456789012345678",
      pageSize: 10,
    });
  });

  it("validates a bare pageSize payload", () => {
    expect(AuditFilter.parse({})).toEqual({});
  });

  it("accepts a payload that sends a cursor", () => {
    const payload = { cursor: "eyJhIjoxfQ" };
    expect(AuditFilter.parse(payload)).toEqual(payload);
  });
});

describe("boundedArray", () => {
  const schema = boundedArray(s.string(), { min: 1, max: 2 });

  it("accepts a length within the bounds as a plain array", () => {
    const parsed: string[] = schema.parse(["a", "b"]);
    expect(parsed).toEqual(["a", "b"]);
  });

  it("rejects fewer items than the minimum", () => {
    expect(() => schema.parse([])).toThrow("at least 1");
  });

  it("rejects more items than the maximum", () => {
    expect(() => schema.parse(["a", "b", "c"])).toThrow("at most 2");
  });

  it("still validates each item", () => {
    expect(() => schema.parse([1])).toThrow();
  });
});
