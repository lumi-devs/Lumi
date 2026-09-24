import { describe, it, expect } from "bun:test";
import { s } from "@sapphire/shapeshift";
import {
  boundedArray,
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
