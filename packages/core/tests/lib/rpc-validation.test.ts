import { describe, it, expect } from "vitest";
import { s } from "@sapphire/shapeshift";
import {
  MAX_PAGE_SIZE,
  PageSchema,
  PageSizeSchema,
  SnowflakeSchema,
  paginate,
  parsePayload,
} from "#lib/rpc/validation.js";

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

describe("parsePayload", () => {
  const schema = s.object({
    name: s.string().lengthGreaterThanOrEqual(1),
    count: s.number().int(),
  });

  it("returns the parsed value on a valid payload", () => {
    expect(parsePayload(schema, { name: "a", count: 1 })).toEqual({
      name: "a",
      count: 1,
    });
  });

  it("prefixes every validation failure with a stable marker", () => {
    expect(() => parsePayload(schema, { name: "", count: 1 })).toThrow(
      /^Bad payload: /,
    );
  });

  it("rejects a missing required field", () => {
    expect(() => parsePayload(schema, { name: "a" })).toThrow("Bad payload");
  });

  it("rejects a wrongly typed field", () => {
    expect(() => parsePayload(schema, { name: "a", count: "1" })).toThrow(
      "Bad payload",
    );
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["a string", "nope"],
    ["a number", 5],
    ["an array", []],
  ])("rejects %s in place of an object payload", (_label, value) => {
    expect(() => parsePayload(schema, value)).toThrow("Bad payload");
  });

  it("rejects a non-integer where an integer is required", () => {
    expect(() => parsePayload(schema, { name: "a", count: 1.5 })).toThrow(
      "Bad payload",
    );
  });

  it("accepts an oversized string when the schema sets no upper bound", () => {
    const huge = "x".repeat(100_000);
    expect(parsePayload(schema, { name: huge, count: 1 }).name).toHaveLength(
      100_000,
    );
  });

  it("rejects an oversized string when the schema bounds it", () => {
    const bounded = s.object({ name: s.string().lengthLessThanOrEqual(64) });
    expect(() =>
      parsePayload(bounded, { name: "x".repeat(65) }),
    ).toThrow("Bad payload");
  });

  it("preserves unicode payloads verbatim", () => {
    const bounded = s.object({ name: s.string().lengthGreaterThanOrEqual(1) });
    for (const name of ["emoji-🎭", "אני", "👨‍👩‍👧‍👦", "日本語"]) {
      expect(parsePayload(bounded, { name }).name).toBe(name);
    }
  });

  it("does not treat an injection-shaped string as anything but text", () => {
    const bounded = s.object({ name: s.string().lengthGreaterThanOrEqual(1) });
    const value = "mods'; DROP TABLE permits;--";
    expect(parsePayload(bounded, { name: value }).name).toBe(value);
  });
});

describe("PageSchema and PageSizeSchema", () => {
  it("treats an absent page as valid", () => {
    expect(PageSchema.parse(undefined)).toBeUndefined();
    expect(PageSizeSchema.parse(undefined)).toBeUndefined();
  });

  it("accepts the first page", () => {
    expect(PageSchema.parse(1)).toBe(1);
  });

  it.each([0, -1, 1.5])("rejects page %s", (value) => {
    expect(() => PageSchema.parse(value)).toThrow();
  });

  it("accepts a page size at the cap", () => {
    expect(PageSizeSchema.parse(MAX_PAGE_SIZE)).toBe(MAX_PAGE_SIZE);
  });

  it("rejects a page size above the cap", () => {
    expect(() => PageSizeSchema.parse(MAX_PAGE_SIZE + 1)).toThrow();
  });

  it.each([0, -5])("rejects page size %s", (value) => {
    expect(() => PageSizeSchema.parse(value)).toThrow();
  });
});

describe("paginate", () => {
  it("defaults to the first page of twenty-five", () => {
    expect(paginate({})).toEqual({ page: 1, pageSize: 25, skip: 0, take: 25 });
  });

  it("skips whole pages ahead of the requested page", () => {
    expect(paginate({ page: 3, pageSize: 10 })).toEqual({
      page: 3,
      pageSize: 10,
      skip: 20,
      take: 10,
    });
  });

  it("keeps skip at zero on the first page for any page size", () => {
    expect(paginate({ page: 1, pageSize: 100 }).skip).toBe(0);
  });

  it("applies the default page size when only a page is given", () => {
    expect(paginate({ page: 2 })).toEqual({
      page: 2,
      pageSize: 25,
      skip: 25,
      take: 25,
    });
  });

  it("applies the default page when only a page size is given", () => {
    expect(paginate({ pageSize: 5 })).toEqual({
      page: 1,
      pageSize: 5,
      skip: 0,
      take: 5,
    });
  });
});
